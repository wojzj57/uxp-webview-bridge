import { BridgeRemoteError } from "../shared/errors.js";
import { createOperationId } from "../shared/operation-id.js";
import {
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
import type { BridgeCallPayload } from "../shared/types.js";

export interface WebViewBridgeTarget {
  postMessage(message: unknown): void;
}

export type RpcCallback = (...args: readonly unknown[]) => unknown | Promise<unknown>;

export interface RpcClientOptions {
  readonly target?: WebViewBridgeTarget;
  /** Fallback origins accepted when UXP does not provide a message source object. */
  readonly allowedOrigins?: readonly string[];
  readonly timeoutMs?: number;
  readonly onUnhandledError?: ((error: BridgeRemoteError) => void) | undefined;
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

interface ActiveModalSession {
  readonly sessionId: string;
  depth: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ALLOWED_ORIGINS = ["plugin:", "plugin-data:", "plugin-temp:"];

export class RpcClient {
  private readonly target: WebViewBridgeTarget;
  private readonly timeoutMs: number;
  private readonly allowedOrigins: readonly string[];
  private readonly onUnhandledError: ((error: BridgeRemoteError) => void) | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly callbackIdByFunction = new WeakMap<RpcCallback, string>();
  private readonly callbacks = new Map<string, RetainedCallback>();
  private activeModalSession: ActiveModalSession | undefined;
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
    this.allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onUnhandledError = options.onUnhandledError;
    window.addEventListener("message", this.onMessageBound);
  }

  get activeModalSessionId(): string | undefined {
    return this.activeModalSession?.sessionId;
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }
    this.destroying = true;
    this.cancelPendingRequests();
    const operationId = createOperationId();
    this.destroyPromise = this.send<void>(
      { type: "bridge.release-all", operationId, payload: {} },
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
    const message: BridgeCancelEnvelope = { type: "bridge.cancel", operationId };
    this.target.postMessage(message);
  }

  private requestEnvelope(
    type: "bridge.call",
    payload: BridgeCallPayload,
    operationId = createOperationId()
  ): BridgeRequestEnvelope<BridgeCallPayload> {
    const sessionId = this.activeModalSession?.sessionId;
    return sessionId === undefined
      ? { type, operationId, payload }
      : { type, operationId, payload, sessionId };
  }

  private send<T>(message: BridgeRequestEnvelope, allowDuringDestroy = false): Promise<T> {
    if ((!allowDuringDestroy && this.destroying) || this.destroyed) {
      return Promise.reject(new Error("The WebView bridge client has been destroyed."));
    }
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(message.operationId);
        try {
          this.cancel(message.operationId);
        } catch {
          // The timeout remains authoritative even if the transport is already unavailable.
        }
        reject(new Error(`Bridge request ${message.operationId} timed out.`));
      }, this.timeoutMs);

      this.pending.set(message.operationId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId
      });

      try {
        this.target.postMessage(message);
      } catch (error) {
        this.pending.delete(message.operationId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private handleMessage(message: unknown): void {
    if (isCallbackInvoke(message)) {
      void this.handleCallbackInvoke(message);
      return;
    }
    if (isUnhandledError(message)) {
      this.reportUnhandled(toRemoteError(message.operationId, message.error));
      return;
    }
    if (!isBridgeResponse(message)) {
      return;
    }

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

  private isAllowedEvent(event: MessageEvent<unknown>): boolean {
    if (event.source) {
      return event.source === this.target;
    }
    return isAllowedOrigin(event.origin, this.allowedOrigins);
  }

  private async handleCallbackInvoke(message: BridgeCallbackInvokeEnvelope): Promise<void> {
    if (this.destroying || this.destroyed) {
      this.postCallbackError(message, new Error("The WebView bridge client is being destroyed."));
      return;
    }
    const retained = this.callbacks.get(message.callbackId);
    if (!retained) {
      this.postCallbackError(message, new Error(`Unknown bridge callback: ${message.callbackId}`));
      return;
    }

    let enteredSession = false;
    try {
      if (message.sessionId !== undefined) {
        this.enterModalSession(message.sessionId);
        enteredSession = true;
      }
      const result = await retained.callback(...message.args);
      assertBridgeTransportValue(result, "bridge callback result");
      const response: BridgeCallbackSuccessEnvelope = {
        type: "bridge.callback.success",
        operationId: message.operationId,
        callbackId: message.callbackId,
        ...(message.sessionId === undefined ? {} : { sessionId: message.sessionId }),
        payload: result
      };
      this.target.postMessage(response);
    } catch (error) {
      this.postCallbackError(message, error);
    } finally {
      if (enteredSession) {
        this.leaveModalSession(message.sessionId as string);
      }
    }
  }

  private postCallbackError(message: BridgeCallbackInvokeEnvelope, error: unknown): void {
    const response: BridgeCallbackErrorEnvelope = {
      type: "bridge.callback.error",
      operationId: message.operationId,
      callbackId: message.callbackId,
      ...(message.sessionId === undefined ? {} : { sessionId: message.sessionId }),
      error: serializeError(error, message.parentOperationId, message.callbackId)
    };
    this.target.postMessage(response);
  }

  private enterModalSession(sessionId: string): void {
    if (this.activeModalSession && this.activeModalSession.sessionId !== sessionId) {
      throw new Error(
        `Modal session ${this.activeModalSession.sessionId} is already active; cannot enter ${sessionId}.`
      );
    }
    if (this.activeModalSession) {
      this.activeModalSession.depth += 1;
    } else {
      this.activeModalSession = { sessionId, depth: 1 };
    }
  }

  private leaveModalSession(sessionId: string): void {
    if (!this.activeModalSession || this.activeModalSession.sessionId !== sessionId) {
      return;
    }
    this.activeModalSession.depth -= 1;
    if (this.activeModalSession.depth === 0) {
      this.activeModalSession = undefined;
    }
  }

  private finishDestroy(releaseOperationId: string): void {
    window.removeEventListener("message", this.onMessageBound);
    this.destroyed = true;
    this.destroying = false;
    this.activeModalSession = undefined;
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

function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.endsWith(":")) {
      return origin.startsWith(allowedOrigin);
    }
    return origin === allowedOrigin;
  });
}

function isBridgeResponse(message: unknown): message is BridgeResponseEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeSuccessEnvelope | BridgeErrorEnvelope>;
  return typeof candidate.operationId === "string" &&
    (candidate.type === "bridge.success" || candidate.type === "bridge.error");
}

function isCallbackInvoke(message: unknown): message is BridgeCallbackInvokeEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeCallbackInvokeEnvelope>;
  return candidate.type === "bridge.callback.invoke" &&
    typeof candidate.operationId === "string" &&
    typeof candidate.callbackId === "string" &&
    Array.isArray(candidate.args) &&
    (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
    (candidate.mode === "awaited" || candidate.mode === "listener");
}

function isUnhandledError(message: unknown): message is BridgeUnhandledErrorEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<BridgeUnhandledErrorEnvelope>;
  return candidate.type === "bridge.unhandled-error" &&
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
        code: error.code
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
    callbackId: error.callbackId
  });
}
