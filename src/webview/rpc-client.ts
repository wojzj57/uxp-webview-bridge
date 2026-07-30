import { BridgeRemoteError } from "../shared/errors.js";
import { createOperationId } from "../shared/operation-id.js";
import { isAllowedOrigin, mergeAllowedOrigins } from "../shared/origins.js";
import {
  BRIDGE_PROTOCOL_VERSION,
  assertBridgeTransportValue,
  type BridgeCallbackErrorEnvelope,
  type BridgeCallbackInvokeEnvelope,
  type BridgeCallbackReference,
  type BridgeCallbackSuccessEnvelope,
  type BridgeCancelEnvelope,
  type BridgeErrorEnvelope,
  type BridgeRequestEnvelope,
  type BridgeResponseEnvelope,
  type BridgeSerializedError,
  type BridgeSuccessEnvelope,
  type BridgeUnhandledErrorEnvelope
} from "../shared/protocol.js";
import type {
  BridgeCallPayload,
  BridgeEstablished,
  BridgeHandshakeCancel,
  BridgeHandshakeCancelAck,
  BridgeHandshakeChallenge,
  BridgeHandshakeError,
  BridgeHandshakeHello,
  BridgeHandshakeReady,
  BridgeHostInfo
} from "../shared/types.js";
import { isRemoteReference } from "../shared/uxp-api/remote-protocol.js";
import { CallbackInvocationContextCarrier } from "./callback-invocation-context.js";

export interface WebViewBridgeTarget {
  postMessage(message: unknown): void;
}

export type RpcCallback = (...args: readonly unknown[]) => unknown;

export interface RpcClientOptions {
  readonly target?: WebViewBridgeTarget;
  /** Additional fallback origins accepted when UXP does not provide a message source object. */
  readonly allowedOrigins?: readonly string[];
  readonly timeoutMs?: number;
  readonly onUnhandledError?: ((error: BridgeRemoteError) => void) | undefined;
  /** Internal direct-client owner used by contract seams. */
  readonly bridgeSessionId?: string;
  /** Internal setup path; public configWebviewBridge always enables it. */
  readonly handshake?: boolean;
  readonly connectionTimeoutMs?: number;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

interface RetainedCallback {
  readonly callback: RpcCallback;
  references: number;
}

interface QueuedRequest {
  readonly message: BridgeRequestEnvelope;
  readonly allowDuringDestroy: boolean;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const CONNECT_QUEUE_LIMIT = 100;

export class RpcClient {
  readonly ready: Promise<BridgeHostInfo>;
  readonly clientEpoch = createOperationId();
  private readonly target: WebViewBridgeTarget;
  private readonly timeoutMs: number;
  private readonly allowedOrigins: readonly string[];
  private readonly onUnhandledError: ((error: BridgeRemoteError) => void) | undefined;
  private bridgeSessionId: string | undefined;
  private readonly handshake: boolean;
  private readonly clientInstanceId = createOperationId();
  private stateValue: "connecting" | "ready" | "failed" | "closing" | "destroyed";
  private readyResolve!: (info: BridgeHostInfo) => void;
  private readyReject!: (reason: unknown) => void;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private candidate: BridgeHandshakeChallenge | undefined;
  private provisionalReady: BridgeHandshakeReady | undefined;
  private readonly queuedRequests: QueuedRequest[] = [];
  private cancelAckResolve: (() => void) | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly callbackIdByFunction = new WeakMap<RpcCallback, string>();
  private readonly callbacks = new Map<string, RetainedCallback>();
  private readonly callbackContext = new CallbackInvocationContextCarrier();
  private destroying = false;
  private destroyed = false;
  private destroyPromise: Promise<void> | undefined;
  private readonly onMessageBound = (event: MessageEvent<unknown>): void => {
    if (!this.isAllowedEvent(event)) {
      return;
    }
    this.handleMessage(event.data);
  };

  constructor(options: RpcClientOptions = {}) {
    this.target = options.target ?? getDefaultWebViewTarget();
    this.allowedOrigins = mergeAllowedOrigins(options.allowedOrigins);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onUnhandledError = options.onUnhandledError;
    this.handshake = options.handshake ?? false;
    this.bridgeSessionId = this.handshake ? undefined : options.bridgeSessionId ?? "bridge.direct";
    this.stateValue = this.handshake ? "connecting" : "ready";
    this.ready = new Promise<BridgeHostInfo>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    void this.ready.catch(() => undefined);
    if (!this.handshake) {
      this.readyResolve({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        hostVersion: "direct",
        capabilities: [],
        navigationReplacement: "unsupported",
        documentGenerationMode: "unsupported"
      });
    }
    window.addEventListener("message", this.onMessageBound);
    if (this.handshake) {
      const connectionTimeoutMs = options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
      if (!Number.isFinite(connectionTimeoutMs) || connectionTimeoutMs <= 0) {
        throw new TypeError("connectionTimeoutMs must be a positive finite number.");
      }
      this.connectionTimer = setTimeout(() => {
        this.failConnecting(codedClientError(
          "ERR_BRIDGE_CONNECTION_TIMEOUT",
          "The WebView bridge connection timed out."
        ));
      }, connectionTimeoutMs);
      const hello: BridgeHandshakeHello = {
        type: "bridge.hello",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        clientVersion: "0.1.0",
        clientInstanceId: this.clientInstanceId
      };
      this.target.postMessage(hello);
    }
  }

  get state(): "connecting" | "ready" | "failed" | "closing" | "destroyed" {
    return this.stateValue;
  }

  get activeBridgeSessionId(): string | undefined {
    return this.bridgeSessionId;
  }

  get activeModalSessionId(): string | undefined {
    return this.callbackContext.current?.modalSessionId;
  }

  async bindReference(
    reference: import("../shared/uxp-api/remote-protocol.js").RemoteReference
  ): Promise<import("../shared/uxp-api/remote-protocol.js").RemoteReference> {
    if (reference.bridgeSessionId === "bridge.connecting") {
      await this.ready;
      const bridgeSessionId = this.bridgeSessionId;
      if (!bridgeSessionId) throw staleReferenceError();
      const ownedReference = { ...reference, bridgeSessionId };
      this.assertReferenceActive(ownedReference);
      return ownedReference;
    }
    this.assertReferenceActive(reference);
    return reference;
  }

  assertReferenceActive(reference: { readonly bridgeSessionId: string }): void {
    if (
      this.destroying ||
      this.destroyed ||
      this.stateValue === "failed" ||
      !this.bridgeSessionId ||
      reference.bridgeSessionId !== this.bridgeSessionId
    ) {
      throw staleReferenceError();
    }
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }
    if (this.stateValue === "connecting") {
      return this.destroyConnecting();
    }
    this.destroying = true;
    this.stateValue = "closing";
    this.cancelPendingRequests();
    const bridgeSessionId = this.bridgeSessionId;
    if (!bridgeSessionId) {
      this.finishConnectingDestroy();
      this.destroyPromise = Promise.resolve();
      return this.destroyPromise;
    }
    const operationId = createOperationId();
    this.destroyPromise = this.send<void>(
      { type: "bridge.release-all", bridgeSessionId, operationId, payload: {} },
      true
    ).finally(() => {
      this.finishDestroy(operationId);
    });
    return this.destroyPromise;
  }

  retainCallback(callback: RpcCallback): BridgeCallbackReference {
    this.assertUsable();
    let callbackId = this.callbackIdByFunction.get(callback);
    if (!callbackId) {
      callbackId = createOperationId();
      this.callbackIdByFunction.set(callback, callbackId);
    }
    const retained = this.callbacks.get(callbackId);
    if (retained) {
      retained.references += 1;
    } else {
      this.callbacks.set(callbackId, { callback, references: 1 });
    }
    return { kind: "bridge.callback.ref", callbackId };
  }

  releaseCallback(reference: BridgeCallbackReference): void {
    const retained = this.callbacks.get(reference.callbackId);
    if (!retained) {
      return;
    }
    retained.references -= 1;
    if (retained.references <= 0) {
      this.callbacks.delete(reference.callbackId);
    }
  }

  call<T>(module: string, method: string, args: readonly unknown[] = []): Promise<T> {
    const payload: BridgeCallPayload = { module, method, args };
    return this.send<T>(this.requestEnvelope("bridge.call", payload));
  }

  callCancelable<T>(
    module: string,
    method: string,
    args: readonly unknown[] = []
  ): { readonly operationId: string; readonly promise: Promise<T> } {
    const operationId = createOperationId();
    const payload: BridgeCallPayload = { module, method, args };
    const promise = this.send<T>(this.requestEnvelope("bridge.call", payload, operationId));
    return { operationId, promise };
  }

  cancel(operationId: string): void {
    if (!this.bridgeSessionId) return;
    const message: BridgeCancelEnvelope = {
      type: "bridge.cancel",
      bridgeSessionId: this.bridgeSessionId,
      operationId
    };
    this.target.postMessage(message);
  }

  private requestEnvelope(
    type: "bridge.call",
    payload: BridgeCallPayload,
    operationId = createOperationId()
  ): BridgeRequestEnvelope<BridgeCallPayload> {
    const bridgeSessionId = this.bridgeSessionId ?? "bridge.connecting";
    const modalContext = this.callbackContext.current;
    return modalContext === undefined
      ? { type, bridgeSessionId, operationId, payload }
      : { type, bridgeSessionId, operationId, payload, modalContext };
  }

  private send<T>(message: BridgeRequestEnvelope, allowDuringDestroy = false): Promise<T> {
    if ((!allowDuringDestroy && this.destroying) || this.destroyed) {
      return Promise.reject(new Error("The WebView bridge client has been destroyed."));
    }
    if (this.handshake && this.stateValue === "connecting") {
      if (this.queuedRequests.length >= CONNECT_QUEUE_LIMIT) {
        return Promise.reject(codedClientError(
          "ERR_BRIDGE_CONNECT_QUEUE_FULL",
          `The pre-ready bridge queue exceeded ${CONNECT_QUEUE_LIMIT} calls.`
        ));
      }
      return new Promise<T>((resolve, reject) => {
        this.queuedRequests.push({
          message,
          allowDuringDestroy,
          resolve: (value) => resolve(value as T),
          reject
        });
      });
    }
    return this.sendEstablished<T>(message, allowDuringDestroy);
  }

  private sendEstablished<T>(message: BridgeRequestEnvelope, allowDuringDestroy = false): Promise<T> {
    if ((!allowDuringDestroy && this.destroying) || this.destroyed || !this.bridgeSessionId) {
      return Promise.reject(codedClientError("ERR_BRIDGE_SESSION_CLOSED", "The Bridge session is closed."));
    }
    let ownedMessage: BridgeRequestEnvelope;
    try {
      ownedMessage = {
        ...message,
        bridgeSessionId: this.bridgeSessionId,
        payload: translateClientReferences(message.payload, this.bridgeSessionId)
      };
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(ownedMessage.operationId);
        try {
          this.cancel(ownedMessage.operationId);
        } catch {
          // The timeout remains authoritative even if the transport is already unavailable.
        }
        reject(new Error(`Bridge request ${ownedMessage.operationId} timed out.`));
      }, this.timeoutMs);

      this.pending.set(ownedMessage.operationId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId
      });

      try {
        this.target.postMessage(ownedMessage);
      } catch (error) {
        this.pending.delete(ownedMessage.operationId);
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleMessage(message: unknown): void {
    if (this.handleHandshakeMessage(message)) return;
    if (isCallbackInvoke(message)) {
      if (!matchesBridgeSession(message.bridgeSessionId, this.bridgeSessionId)) return;
      void this.handleCallbackInvoke(message);
      return;
    }
    if (isUnhandledError(message)) {
      if (!matchesBridgeSession(message.bridgeSessionId, this.bridgeSessionId)) return;
      this.reportUnhandled(toRemoteError(message.operationId, message.error));
      return;
    }
    if (!isBridgeResponse(message)) {
      return;
    }
    if (!matchesBridgeSession(message.bridgeSessionId, this.bridgeSessionId)) return;

    const request = this.pending.get(message.operationId);
    if (!request) {
      return;
    }

    this.pending.delete(message.operationId);
    clearTimeout(request.timeoutId);

    if (message.type === "bridge.success") {
      request.resolve(message.payload);
      return;
    }

    request.reject(toRemoteError(message.operationId, message.error));
  }

  private handleHandshakeMessage(message: unknown): boolean {
    if (!isRecord(message) || typeof message.type !== "string") return false;
    if (message.type === "bridge.handshake.challenge") {
      const challenge = message as unknown as BridgeHandshakeChallenge;
      if (this.stateValue !== "connecting" || challenge.clientInstanceId !== this.clientInstanceId) {
        return true;
      }
      this.candidate = challenge;
      this.target.postMessage({
        type: "bridge.handshake.ack",
        clientInstanceId: this.clientInstanceId,
        candidateId: challenge.candidateId,
        documentGeneration: challenge.documentGeneration,
        challenge: challenge.challenge
      });
      return true;
    }
    if (message.type === "bridge.ready") {
      const ready = message as unknown as BridgeHandshakeReady;
      if (!this.matchesCandidate(ready)) return true;
      this.provisionalReady = ready;
      this.bridgeSessionId = ready.bridgeSessionId;
      this.target.postMessage({
        type: "bridge.ready.ack",
        clientInstanceId: this.clientInstanceId,
        candidateId: ready.candidateId,
        documentGeneration: ready.documentGeneration,
        bridgeSessionId: ready.bridgeSessionId,
        readyNonce: ready.readyNonce
      });
      return true;
    }
    if (message.type === "bridge.established") {
      const established = message as unknown as BridgeEstablished;
      const ready = this.provisionalReady;
      if (this.stateValue !== "connecting" || !ready ||
        established.clientInstanceId !== this.clientInstanceId ||
        established.candidateId !== ready.candidateId ||
        established.documentGeneration !== ready.documentGeneration ||
        established.bridgeSessionId !== ready.bridgeSessionId) return true;
      this.target.postMessage({
        type: "bridge.session.confirm",
        bridgeSessionId: established.bridgeSessionId,
        clientInstanceId: this.clientInstanceId,
        documentGeneration: established.documentGeneration
      });
      if (this.connectionTimer) clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
      this.stateValue = "ready";
      this.readyResolve({
        protocolVersion: ready.protocolVersion,
        hostVersion: ready.hostVersion,
        capabilities: ready.capabilities,
        ...(ready.constantsHash === undefined ? {} : { constantsHash: ready.constantsHash }),
        navigationReplacement: ready.navigationReplacement,
        documentGenerationMode: ready.documentGenerationMode
      });
      this.flushQueuedRequests();
      return true;
    }
    if (message.type === "bridge.handshake.error") {
      const handshakeError = message as unknown as BridgeHandshakeError;
      if (handshakeError.clientInstanceId === this.clientInstanceId && this.stateValue === "connecting") {
        this.failConnecting(toRemoteError("bridge.connect", handshakeError.error));
      }
      return true;
    }
    if (message.type === "bridge.handshake.cancelled") {
      const cancelAck = message as unknown as BridgeHandshakeCancelAck;
      if (cancelAck.clientInstanceId === this.clientInstanceId) this.cancelAckResolve?.();
      return true;
    }
    return false;
  }

  private matchesCandidate(ready: BridgeHandshakeReady): boolean {
    const candidate = this.candidate;
    return this.stateValue === "connecting" && !!candidate &&
      ready.clientInstanceId === this.clientInstanceId &&
      ready.candidateId === candidate.candidateId &&
      ready.documentGeneration === candidate.documentGeneration;
  }

  private flushQueuedRequests(): void {
    for (const queued of this.queuedRequests.splice(0)) {
      void this.sendEstablished(queued.message, queued.allowDuringDestroy).then(
        queued.resolve,
        queued.reject
      );
    }
  }

  private failConnecting(error: unknown): void {
    if (this.stateValue !== "connecting") return;
    this.stateValue = "failed";
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
    this.readyReject(error);
    for (const queued of this.queuedRequests.splice(0)) queued.reject(error);
  }

  private destroyConnecting(): Promise<void> {
    this.destroying = true;
    this.stateValue = "closing";
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
    const error = codedClientError("ERR_BRIDGE_SESSION_CLOSED", "The Bridge connection was destroyed.");
    this.readyReject(error);
    for (const queued of this.queuedRequests.splice(0)) queued.reject(error);
    const candidate = this.candidate;
    const ready = this.provisionalReady;
    const cancel: BridgeHandshakeCancel = {
      type: "bridge.handshake.cancel",
      clientInstanceId: this.clientInstanceId,
      ...(candidate === undefined ? {} : {
        candidateId: candidate.candidateId,
        documentGeneration: candidate.documentGeneration,
        challenge: candidate.challenge
      }),
      ...(ready === undefined ? {} : { bridgeSessionId: ready.bridgeSessionId })
    };
    this.destroyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.finishConnectingDestroy();
        reject(codedClientError(
          "ERR_BRIDGE_HANDSHAKE_CANCEL_UNCONFIRMED",
          "The Host did not confirm handshake cancellation."
        ));
      }, 1_000);
      this.cancelAckResolve = () => {
        clearTimeout(timeout);
        this.finishConnectingDestroy();
        resolve();
      };
      try {
        this.target.postMessage(cancel);
      } catch (postError) {
        clearTimeout(timeout);
        this.finishConnectingDestroy();
        reject(postError);
      }
    });
    return this.destroyPromise;
  }

  private finishConnectingDestroy(): void {
    window.removeEventListener("message", this.onMessageBound);
    this.cancelAckResolve = undefined;
    this.destroying = false;
    this.destroyed = true;
    this.stateValue = "destroyed";
  }

  private isAllowedEvent(event: MessageEvent<unknown>): boolean {
    if (event.source && event.source !== this.target) return false;
    return isAllowedOrigin(event.origin, this.allowedOrigins);
  }

  private async handleCallbackInvoke(message: BridgeCallbackInvokeEnvelope): Promise<void> {
    const bridgeSessionId = this.bridgeSessionId;
    if (!bridgeSessionId) return;
    if (this.destroying || this.destroyed) {
      this.postCallbackError(message, new Error("The WebView bridge client is being destroyed."));
      return;
    }
    const retained = this.callbacks.get(message.callbackId);
    if (!retained) {
      this.postCallbackError(message, new Error(`Unknown bridge callback: ${message.callbackId}`));
      return;
    }

    try {
      const invoke = () => retained.callback(...message.args);
      const result = message.modalSessionId !== undefined && message.parentOperationId !== undefined
        ? await this.callbackContext.run({
          modalSessionId: message.modalSessionId,
          callbackInvocationId: message.operationId,
          parentOperationId: message.parentOperationId
        }, invoke)
        : await invoke();
      assertBridgeTransportValue(result, "bridge callback result");
      const response: BridgeCallbackSuccessEnvelope = {
        type: "bridge.callback.success",
        bridgeSessionId,
        operationId: message.operationId,
        callbackId: message.callbackId,
        ...(message.modalSessionId === undefined ? {} : { modalSessionId: message.modalSessionId }),
        ...(message.parentOperationId === undefined ? {} : { parentOperationId: message.parentOperationId }),
        payload: translateClientReferences(result, bridgeSessionId)
      };
      this.target.postMessage(response);
    } catch (error) {
      this.postCallbackError(message, error);
    }
  }

  private postCallbackError(message: BridgeCallbackInvokeEnvelope, error: unknown): void {
    const bridgeSessionId = this.bridgeSessionId;
    if (!bridgeSessionId) return;
    const response: BridgeCallbackErrorEnvelope = {
      type: "bridge.callback.error",
      bridgeSessionId,
      operationId: message.operationId,
      callbackId: message.callbackId,
      ...(message.modalSessionId === undefined ? {} : { modalSessionId: message.modalSessionId }),
      ...(message.parentOperationId === undefined ? {} : { parentOperationId: message.parentOperationId }),
      error: serializeError(error, message.parentOperationId, message.callbackId)
    };
    this.target.postMessage(response);
  }

  private finishDestroy(releaseOperationId: string): void {
    window.removeEventListener("message", this.onMessageBound);
    this.destroyed = true;
    this.destroying = false;
    this.stateValue = "destroyed";
    this.callbackContext.invalidate();
    this.callbacks.clear();
    for (const [operationId, request] of this.pending) {
      if (operationId === releaseOperationId) {
        continue;
      }
      clearTimeout(request.timeoutId);
      request.reject(new Error(`Bridge request ${operationId} was cancelled.`));
    }
    this.pending.clear();
  }

  private cancelPendingRequests(): void {
    for (const [operationId, request] of this.pending) {
      clearTimeout(request.timeoutId);
      try {
        this.cancel(operationId);
      } catch {
        // Local cancellation remains authoritative if the transport is already unavailable.
      }
      request.reject(new Error(`Bridge request ${operationId} was cancelled.`));
      this.pending.delete(operationId);
    }
  }

  private assertUsable(): void {
    if (this.destroying || this.destroyed) {
      throw new Error("The WebView bridge client has been destroyed.");
    }
  }

  private reportUnhandled(error: BridgeRemoteError): void {
    if (this.onUnhandledError) {
      try {
        this.onUnhandledError(error);
      } catch (handlerError) {
        console.error(handlerError);
      }
      return;
    }
    console.error(error);
  }
}

function getDefaultWebViewTarget(): WebViewBridgeTarget {
  const maybeHost = (window as Window & { uxpHost?: WebViewBridgeTarget }).uxpHost;
  if (!maybeHost) {
    throw new Error("window.uxpHost is not available. Pass an explicit target to configWebviewBridge().");
  }
  return maybeHost;
}

function isBridgeResponse(message: unknown): message is BridgeResponseEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeSuccessEnvelope | BridgeErrorEnvelope>;
  return (candidate.bridgeSessionId === undefined || typeof candidate.bridgeSessionId === "string") &&
    typeof candidate.operationId === "string" &&
    (candidate.type === "bridge.success" || candidate.type === "bridge.error");
}

function isCallbackInvoke(message: unknown): message is BridgeCallbackInvokeEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeCallbackInvokeEnvelope>;
  return candidate.type === "bridge.callback.invoke" &&
    (candidate.bridgeSessionId === undefined || typeof candidate.bridgeSessionId === "string") &&
    typeof candidate.operationId === "string" &&
    typeof candidate.callbackId === "string" &&
    Array.isArray(candidate.args) &&
    (candidate.modalSessionId === undefined || typeof candidate.modalSessionId === "string") &&
    (candidate.mode === "awaited" || candidate.mode === "listener");
}

function isUnhandledError(message: unknown): message is BridgeUnhandledErrorEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeUnhandledErrorEnvelope>;
  return candidate.type === "bridge.unhandled-error" &&
    (candidate.bridgeSessionId === undefined || typeof candidate.bridgeSessionId === "string") &&
    typeof candidate.operationId === "string" &&
    typeof candidate.error?.remoteMessage === "string";
}

function serializeError(
  error: unknown,
  parentOperationId?: string,
  callbackId?: string
): BridgeSerializedError {
  const metadata = error instanceof BridgeRemoteError
    ? {
        remoteName: error.remoteName,
        remoteMessage: error.remoteMessage,
        remoteStack: error.remoteStack,
        code: error.code,
        capability: error.capability,
        module: error.module,
        method: error.method
      }
    : error instanceof Error
      ? {
          remoteName: error.name,
          remoteMessage: error.message,
          remoteStack: error.stack,
          code: typeof (error as Error & { code?: unknown }).code === "string"
            ? (error as Error & { code: string }).code
            : undefined
        }
      : { remoteName: "Error", remoteMessage: String(error) };
  return { ...metadata, parentOperationId, callbackId };
}

function toRemoteError(operationId: string, error: BridgeSerializedError): BridgeRemoteError {
  return new BridgeRemoteError({
    operationId,
    remoteName: error.remoteName,
    remoteMessage: error.remoteMessage,
    remoteStack: error.remoteStack,
    code: error.code,
    parentOperationId: error.parentOperationId,
    callbackId: error.callbackId,
    capability: error.capability,
    module: error.module,
    method: error.method
  });
}

function codedClientError(code: string, message: string): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function staleReferenceError(): Error & { readonly code: string } {
  return codedClientError(
    "ERR_BRIDGE_STALE_REFERENCE",
    "Remote reference belongs to an inactive WebView client epoch."
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function matchesBridgeSession(actual: string | undefined, expected: string | undefined): boolean {
  return actual === expected || (actual === undefined && expected === "bridge.direct");
}

function translateClientReferences(value: unknown, bridgeSessionId: string): unknown {
  if (isSessionOwnedReference(value)) {
    if (value.bridgeSessionId === bridgeSessionId) return value;
    throw codedClientError(
      "ERR_BRIDGE_STALE_REFERENCE",
      "Remote reference belongs to a stale Bridge session."
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => translateClientReferences(entry, bridgeSessionId));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        translateClientReferences(entry, bridgeSessionId)
      ])
    );
  }
  return value;
}

function isSessionOwnedReference(value: unknown): value is {
  readonly kind: "uxp.remote.ref" | "uxp.storage.entry";
  readonly id: string;
  readonly bridgeSessionId: string;
} {
  return isRemoteReference(value) || (
    isRecord(value) && value.kind === "uxp.storage.entry" && typeof value.id === "string" &&
    typeof value.bridgeSessionId === "string"
  );
}
