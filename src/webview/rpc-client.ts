import { BridgeRemoteError } from "../shared/errors.js";
import { createOperationId } from "../shared/operation-id.js";
import type {
  BridgeCancelEnvelope,
  BridgeErrorEnvelope,
  BridgeRequestEnvelope,
  BridgeResponseEnvelope,
  BridgeSuccessEnvelope
} from "../shared/protocol.js";
import type { BridgeCallPayload } from "../shared/types.js";

export interface WebViewBridgeTarget {
  postMessage(message: unknown): void;
}

export interface RpcClientOptions {
  readonly target?: WebViewBridgeTarget;
  readonly timeoutMs?: number;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class RpcClient {
  private readonly target: WebViewBridgeTarget;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly onMessageBound = (event: MessageEvent<unknown>): void => {
    this.handleMessage(event.data);
  };

  constructor(options: RpcClientOptions = {}) {
    this.target = options.target ?? getDefaultWebViewTarget();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    window.addEventListener("message", this.onMessageBound);
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessageBound);
    for (const [operationId, request] of this.pending) {
      clearTimeout(request.timeoutId);
      request.reject(new Error(`Bridge request ${operationId} was cancelled.`));
    }
    this.pending.clear();
  }

  call<T>(module: string, method: string, args: readonly unknown[] = []): Promise<T> {
    const payload: BridgeCallPayload = { module, method, args };
    return this.send<T>({ type: "bridge.call", operationId: createOperationId(), payload });
  }

  callCancelable<T>(
    module: string,
    method: string,
    args: readonly unknown[] = []
  ): { readonly operationId: string; readonly promise: Promise<T> } {
    const operationId = createOperationId();
    const payload: BridgeCallPayload = { module, method, args };
    const promise = this.send<T>({ type: "bridge.call", operationId, payload });
    return { operationId, promise };
  }

  cancel(operationId: string): void {
    const message: BridgeCancelEnvelope = { type: "bridge.cancel", operationId };
    this.target.postMessage(message);
  }

  private send<T>(message: BridgeRequestEnvelope): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(message.operationId);
        reject(new Error(`Bridge request ${message.operationId} timed out.`));
      }, this.timeoutMs);

      this.pending.set(message.operationId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId
      });

      this.target.postMessage(message);
    });
  }

  private handleMessage(message: unknown): void {
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

    request.reject(
      new BridgeRemoteError({
        operationId: message.operationId,
        remoteName: message.error.remoteName,
        remoteMessage: message.error.remoteMessage,
        remoteStack: message.error.remoteStack,
        code: message.error.code
      })
    );
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
  return candidate.type === "bridge.success" || candidate.type === "bridge.error";
}
