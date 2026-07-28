import { BridgeRemoteError } from "../shared/errors.js";
import { createOperationId } from "../shared/operation-id.js";
import {
  assertBridgeTransportValue,
  isBridgeCallbackReference,
  type BridgeCallbackErrorEnvelope,
  type BridgeCallbackInvokeEnvelope,
  type BridgeCallbackReference,
  type BridgeCallbackResultEnvelope,
  type BridgeCancelEnvelope,
  type BridgeErrorEnvelope,
  type BridgeRequestEnvelope,
  type BridgeSerializedError,
  type BridgeSuccessEnvelope,
  type BridgeUnhandledErrorEnvelope
} from "../shared/protocol.js";
import type { BridgeCallPayload } from "../shared/types.js";
import type {
  UxpCallbackBridge,
  UxpCallbackInvokeOptions,
  UxpModalSession
} from "./module-registry.js";

export interface UxpWebViewElement {
  postMessage(message: unknown): void;
}

export interface RpcHostDispatchOptions {
  readonly signal: AbortSignal;
  readonly operationId: string;
  readonly modalSessionId?: string;
  readonly callbacks: UxpCallbackBridge;
}

export interface RpcHostOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins: readonly string[];
  readonly callbackTimeoutMs?: number;
  readonly dispatchCall: (
    payload: BridgeCallPayload,
    options: RpcHostDispatchOptions
  ) => unknown | Promise<unknown>;
}

interface PendingCallbackInvocation {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly callbackId: string;
  readonly sessionId?: string;
  readonly timeoutId?: ReturnType<typeof setTimeout>;
}

interface InFlightOperation {
  readonly controller: AbortController;
  readonly completion: Promise<void>;
  readonly complete: () => void;
}

interface ListenerQueueEntry {
  readonly reference: BridgeCallbackReference;
  readonly args: readonly unknown[];
  readonly options: UxpCallbackInvokeOptions;
  readonly resolve: (value: unknown) => void;
}

interface SubscriptionState {
  readonly cleanup: () => void | Promise<void>;
  readonly queue: ListenerQueueEntry[];
  running: boolean;
  closed: boolean;
}

const DEFAULT_CALLBACK_TIMEOUT_MS = 60_000;
const LISTENER_QUEUE_LIMIT = 256;

export class RpcHost {
  private readonly webview: UxpWebViewElement;
  private readonly allowedOrigins: readonly string[];
  private readonly callbackTimeoutMs: number;
  private readonly dispatchCall: (
    payload: BridgeCallPayload,
    options: RpcHostDispatchOptions
  ) => unknown | Promise<unknown>;
  private readonly inFlight = new Map<string, InFlightOperation>();
  private readonly pendingCallbacks = new Map<string, PendingCallbackInvocation>();
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private modalSessionId: string | undefined;
  private destroyed = false;
  private destroyPromise: Promise<void> | undefined;
  private readonly callbacks: UxpCallbackBridge;
  private readonly onMessageBound = (event: MessageEvent<unknown>): void => {
    void this.handleMessage(event);
  };

  constructor(options: RpcHostOptions) {
    this.webview = options.webview;
    this.allowedOrigins = options.allowedOrigins;
    this.callbackTimeoutMs = options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
    if (!Number.isFinite(this.callbackTimeoutMs) || this.callbackTimeoutMs < 0) {
      throw new TypeError("callbackTimeoutMs must be a non-negative finite number.");
    }
    this.dispatchCall = options.dispatchCall;
    this.callbacks = this.createCallbackBridge();
    window.addEventListener("message", this.onMessageBound);
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) {
      return this.destroyPromise;
    }
    this.destroyed = true;
    window.removeEventListener("message", this.onMessageBound);
    for (const operation of this.inFlight.values()) {
      operation.controller.abort();
    }
    this.destroyPromise = this.releaseAll(
      new BridgeRemoteError({
        operationId: "bridge.destroy",
        remoteName: "BridgeDestroyedError",
        remoteMessage: "The UXP bridge host was destroyed.",
        code: "ERR_BRIDGE_DESTROYED"
      })
    );
    return this.destroyPromise;
  }

  private async handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (this.destroyed || !this.isAllowedEvent(event)) {
      return;
    }

    const message = event.data;
    if (isCallbackResult(message)) {
      this.handleCallbackResult(message);
      return;
    }
    if (isBridgeCancel(message)) {
      this.inFlight.get(message.operationId)?.controller.abort();
      return;
    }
    if (!isBridgeRequest(message)) {
      return;
    }
    if (this.inFlight.has(message.operationId)) {
      this.postError(message.operationId, new Error(`Duplicate bridge operation id: ${message.operationId}`));
      return;
    }

    const operation = createInFlightOperation();
    this.inFlight.set(message.operationId, operation);
    try {
      if (message.type === "bridge.release-all") {
        await this.releaseAll(
          new BridgeRemoteError({
            operationId: message.operationId,
            remoteName: "BridgeReleasedError",
            remoteMessage: "The WebView released all bridge callbacks and sessions.",
            code: "ERR_BRIDGE_RELEASED"
          }),
          message.operationId
        );
        this.postSuccess({ type: "bridge.success", operationId: message.operationId, payload: undefined });
        return;
      }

      this.assertModalSession(message.sessionId);
      const payload = await this.dispatch(message, operation.controller.signal);
      this.postSuccess({ type: "bridge.success", operationId: message.operationId, payload });
    } catch (error) {
      this.postError(message.operationId, error);
    } finally {
      this.inFlight.delete(message.operationId);
      operation.complete();
    }
  }

  private isAllowedEvent(event: MessageEvent<unknown>): boolean {
    if ("source" in event && event.source && event.source !== this.webview) {
      return false;
    }
    return isAllowedOrigin(event.origin, this.allowedOrigins);
  }

  private dispatch(message: BridgeRequestEnvelope, signal: AbortSignal): unknown | Promise<unknown> {
    if (message.type !== "bridge.call") {
      throw new BridgeRemoteError({
        operationId: message.operationId,
        remoteName: "UnsupportedBridgeOperation",
        remoteMessage: `Unsupported bridge operation: ${message.type}`,
        code: "ERR_UNSUPPORTED_OPERATION"
      });
    }
    const options: RpcHostDispatchOptions = {
      signal,
      operationId: message.operationId,
      callbacks: this.callbacks,
      ...(message.sessionId === undefined ? {} : { modalSessionId: message.sessionId })
    };
    return this.dispatchCall(message.payload as BridgeCallPayload, options);
  }

  private createCallbackBridge(): UxpCallbackBridge {
    const host = this;
    return {
      get activeModalSessionId() {
        return host.modalSessionId;
      },
      invoke<T>(
        reference: BridgeCallbackReference,
        args: readonly unknown[] = [],
        options: UxpCallbackInvokeOptions = {}
      ): Promise<T> {
        return host.invokeCallback<T>(reference, args, options);
      },
      registerSubscription(subscriptionId, cleanup) {
        host.registerSubscription(subscriptionId, cleanup);
      },
      unregisterSubscription(subscriptionId) {
        return host.unregisterSubscription(subscriptionId);
      },
      openModalSession(parentOperationId) {
        return host.openModalSession(parentOperationId);
      }
    };
  }

  private invokeCallback<T>(
    reference: BridgeCallbackReference,
    args: readonly unknown[],
    options: UxpCallbackInvokeOptions
  ): Promise<T> {
    if (!isBridgeCallbackReference(reference)) {
      return Promise.reject(new TypeError("A valid bridge callback reference is required."));
    }
    assertBridgeTransportValue(args, "bridge callback arguments");
    if (options.mode === "listener") {
      if (!options.subscriptionId) {
        return Promise.reject(new Error("Listener callback invocation requires a subscriptionId."));
      }
      return this.enqueueListener<T>(reference, args, options.subscriptionId, options);
    }
    return this.invokeCallbackNow<T>(reference, args, { ...options, mode: "awaited" });
  }

  private invokeCallbackNow<T>(
    reference: BridgeCallbackReference,
    args: readonly unknown[],
    options: UxpCallbackInvokeOptions
  ): Promise<T> {
    if (this.destroyed) {
      return Promise.reject(new Error("The UXP bridge host has been destroyed."));
    }
    const operationId = createOperationId();
    const mode = options.mode ?? "awaited";
    const message: BridgeCallbackInvokeEnvelope = {
      type: "bridge.callback.invoke",
      operationId,
      callbackId: reference.callbackId,
      args,
      mode,
      ...(options.parentOperationId === undefined ? {} : { parentOperationId: options.parentOperationId }),
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId })
    };
    return new Promise<T>((resolve, reject) => {
      const timeoutId = this.callbackTimeoutMs === 0
        ? undefined
        : setTimeout(() => {
            this.pendingCallbacks.delete(operationId);
            reject(new BridgeRemoteError({
              operationId,
              remoteName: "BridgeCallbackTimeoutError",
              remoteMessage: `Bridge callback ${reference.callbackId} timed out.`,
              code: "ERR_BRIDGE_CALLBACK_TIMEOUT",
              parentOperationId: options.parentOperationId,
              callbackId: reference.callbackId
            }));
          }, this.callbackTimeoutMs);
      this.pendingCallbacks.set(operationId, {
        resolve: (value) => resolve(value as T),
        reject,
        callbackId: reference.callbackId,
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(timeoutId === undefined ? {} : { timeoutId })
      });
      try {
        this.webview.postMessage(message);
      } catch (error) {
        this.pendingCallbacks.delete(operationId);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private enqueueListener<T>(
    reference: BridgeCallbackReference,
    args: readonly unknown[],
    subscriptionId: string,
    options: UxpCallbackInvokeOptions
  ): Promise<T> {
    const state = this.subscriptions.get(subscriptionId);
    if (!state || state.closed) {
      return Promise.reject(new Error(`Unknown callback subscription: ${subscriptionId}`));
    }
    const depth = state.queue.length + (state.running ? 1 : 0);
    if (depth >= LISTENER_QUEUE_LIMIT) {
      void this.overflowSubscription(subscriptionId, reference.callbackId);
      return Promise.resolve(undefined as T);
    }
    return new Promise<T>((resolve) => {
      state.queue.push({
        reference,
        args,
        options: { ...options, mode: "listener", subscriptionId },
        resolve: (value) => resolve(value as T)
      });
      void this.drainSubscription(subscriptionId, state);
    });
  }

  private async drainSubscription(subscriptionId: string, state: SubscriptionState): Promise<void> {
    if (state.running || state.closed) {
      return;
    }
    state.running = true;
    try {
      while (!state.closed) {
        const entry = state.queue.shift();
        if (!entry) break;
        try {
          const result = await this.invokeCallbackNow(entry.reference, entry.args, entry.options);
          entry.resolve(result);
        } catch (error) {
          entry.resolve(undefined);
          if (!state.closed) {
            this.postUnhandled(error, entry.reference.callbackId, entry.options.parentOperationId);
          }
        }
      }
    } finally {
      state.running = false;
      if (!state.closed && state.queue.length > 0 && this.subscriptions.get(subscriptionId) === state) {
        void this.drainSubscription(subscriptionId, state);
      }
    }
  }

  private registerSubscription(
    subscriptionId: string,
    cleanup: () => void | Promise<void>
  ): void {
    if (!subscriptionId) throw new TypeError("subscriptionId must be a non-empty string.");
    if (this.subscriptions.has(subscriptionId)) {
      throw new Error(`Duplicate callback subscription: ${subscriptionId}`);
    }
    this.subscriptions.set(subscriptionId, { cleanup, queue: [], running: false, closed: false });
  }

  private async unregisterSubscription(subscriptionId: string): Promise<void> {
    const state = this.subscriptions.get(subscriptionId);
    if (!state) return;
    this.subscriptions.delete(subscriptionId);
    state.closed = true;
    for (const entry of state.queue.splice(0)) entry.resolve(undefined);
    try {
      await state.cleanup();
    } catch (error) {
      // Keep a closed cleanup record so an explicit retry or later release-all can retry cleanup.
      this.subscriptions.set(subscriptionId, state);
      throw error;
    }
  }

  private async overflowSubscription(subscriptionId: string, callbackId: string): Promise<void> {
    try {
      await this.unregisterSubscription(subscriptionId);
    } catch (error) {
      this.postUnhandled(error, callbackId);
    }
    this.postUnhandled(
      new BridgeRemoteError({
        operationId: subscriptionId,
        remoteName: "BridgeCallbackBackpressureError",
        remoteMessage: `Callback subscription ${subscriptionId} exceeded the ${LISTENER_QUEUE_LIMIT}-event queue limit.`,
        code: "ERR_BRIDGE_CALLBACK_BACKPRESSURE",
        callbackId
      }),
      callbackId
    );
  }

  private openModalSession(parentOperationId?: string): UxpModalSession {
    if (this.modalSessionId !== undefined) {
      throw new Error(`Modal session ${this.modalSessionId} is already active for this bridge.`);
    }
    const sessionId = createOperationId();
    this.modalSessionId = sessionId;
    let closed = false;
    return {
      sessionId,
      invoke: <T>(reference: BridgeCallbackReference, args: readonly unknown[] = []) =>
        this.invokeCallback<T>(reference, args, {
          mode: "awaited",
          sessionId,
          ...(parentOperationId === undefined ? {} : { parentOperationId })
        }),
      close: async () => {
        if (closed) return;
        closed = true;
        if (this.modalSessionId === sessionId) {
          this.modalSessionId = undefined;
        }
      }
    };
  }

  private assertModalSession(sessionId: string | undefined): void {
    if (sessionId === undefined) {
      if (this.modalSessionId !== undefined) {
        throw new Error(`Bridge call must belong to active modal session ${this.modalSessionId}.`);
      }
      return;
    }
    if (sessionId !== this.modalSessionId) {
      throw new Error(`Unknown or inactive modal session: ${sessionId}`);
    }
  }

  private handleCallbackResult(message: BridgeCallbackResultEnvelope): void {
    const pending = this.pendingCallbacks.get(message.operationId);
    if (!pending) return;
    if (message.callbackId !== pending.callbackId || message.sessionId !== pending.sessionId) return;
    this.pendingCallbacks.delete(message.operationId);
    if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
    if (message.type === "bridge.callback.success") {
      try {
        assertBridgeTransportValue(message.payload, "bridge callback result");
        pending.resolve(message.payload);
      } catch (error) {
        pending.reject(error);
      }
      return;
    }
    pending.reject(toRemoteError(message.operationId, message.error));
  }

  private async releaseAll(reason: BridgeRemoteError, excludeOperationId?: string): Promise<void> {
    const inFlightCompletions: Promise<void>[] = [];
    for (const [operationId, operation] of this.inFlight) {
      if (operationId === excludeOperationId) continue;
      operation.controller.abort();
      inFlightCompletions.push(operation.completion);
    }
    for (const [operationId, pending] of this.pendingCallbacks) {
      if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
      pending.reject(reason);
      this.pendingCallbacks.delete(operationId);
    }
    this.modalSessionId = undefined;
    const subscriptionIds = [...this.subscriptions.keys()];
    const cleanupResults = await Promise.allSettled([
      ...subscriptionIds.map((id) => this.unregisterSubscription(id)),
      ...inFlightCompletions
    ]);
    const failedCleanup = cleanupResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failedCleanup) {
      throw failedCleanup.reason;
    }
  }

  private postSuccess(message: BridgeSuccessEnvelope): void {
    this.webview.postMessage(message);
  }

  private postError(operationId: string, error: unknown): void {
    const message: BridgeErrorEnvelope = {
      type: "bridge.error",
      operationId,
      error: normalizeError(error)
    };
    this.webview.postMessage(message);
  }

  private postUnhandled(error: unknown, callbackId?: string, parentOperationId?: string): void {
    if (this.destroyed) return;
    const operationId = error instanceof BridgeRemoteError ? error.operationId : createOperationId();
    const message: BridgeUnhandledErrorEnvelope = {
      type: "bridge.unhandled-error",
      operationId,
      error: { ...normalizeError(error), callbackId, parentOperationId }
    };
    this.webview.postMessage(message);
  }
}

function createInFlightOperation(): InFlightOperation {
  const controller = new AbortController();
  let complete = (): void => undefined;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { controller, completion, complete };
}

export function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.endsWith(":")) {
      return origin.startsWith(allowedOrigin);
    }
    return origin === allowedOrigin;
  });
}

function normalizeError(error: unknown): BridgeSerializedError {
  if (error instanceof BridgeRemoteError) {
    return {
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage,
      remoteStack: error.remoteStack,
      code: error.code,
      parentOperationId: error.parentOperationId,
      callbackId: error.callbackId
    };
  }
  if (error instanceof Error) {
    return {
      remoteName: error.name,
      remoteMessage: error.message,
      remoteStack: error.stack,
      code: typeof (error as Error & { code?: unknown }).code === "string"
        ? (error as Error & { code: string }).code
        : undefined
    };
  }
  return { remoteName: "Error", remoteMessage: String(error) };
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

function isBridgeRequest(message: unknown): message is BridgeRequestEnvelope {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<BridgeRequestEnvelope>;
  return typeof candidate.operationId === "string" &&
    (candidate.type === "bridge.call" || candidate.type === "bridge.release-all");
}

function isBridgeCancel(message: unknown): message is BridgeCancelEnvelope {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<BridgeCancelEnvelope>;
  return typeof candidate.operationId === "string" && candidate.type === "bridge.cancel";
}

function isCallbackResult(message: unknown): message is BridgeCallbackResultEnvelope {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<BridgeCallbackResultEnvelope>;
  const hasIdentity = typeof candidate.operationId === "string" &&
    typeof candidate.callbackId === "string" &&
    (candidate.sessionId === undefined || typeof candidate.sessionId === "string");
  if (!hasIdentity) return false;
  if (candidate.type === "bridge.callback.success") return true;
  return candidate.type === "bridge.callback.error" &&
    typeof (candidate as Partial<BridgeCallbackErrorEnvelope>).error?.remoteMessage === "string";
}
