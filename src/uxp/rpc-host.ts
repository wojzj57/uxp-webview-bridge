import { BridgeRemoteError } from "../shared/errors.js";
import type {
  BridgeCancelEnvelope,
  BridgeErrorEnvelope,
  BridgeRequestEnvelope,
  BridgeSuccessEnvelope
} from "../shared/protocol.js";
import type { BridgeCallPayload } from "../shared/types.js";

export interface UxpWebViewElement {
  postMessage(message: unknown): void;
}

export interface RpcHostDispatchOptions {
  readonly signal: AbortSignal;
}

export interface RpcHostOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins: readonly string[];
  readonly dispatchCall: (
    payload: BridgeCallPayload,
    options: RpcHostDispatchOptions
  ) => unknown | Promise<unknown>;
}

export class RpcHost {
  private readonly webview: UxpWebViewElement;
  private readonly allowedOrigins: readonly string[];
  private readonly dispatchCall: (
    payload: BridgeCallPayload,
    options: RpcHostDispatchOptions
  ) => unknown | Promise<unknown>;
  private readonly inFlight = new Map<string, AbortController>();
  private readonly onMessageBound = (event: MessageEvent<unknown>): void => {
    void this.handleMessage(event);
  };

  constructor(options: RpcHostOptions) {
    this.webview = options.webview;
    this.allowedOrigins = options.allowedOrigins;
    this.dispatchCall = options.dispatchCall;
    window.addEventListener("message", this.onMessageBound);
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessageBound);
    for (const controller of this.inFlight.values()) {
      controller.abort();
    }
    this.inFlight.clear();
  }

  private async handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (!this.isAllowedEvent(event)) {
      return;
    }

    const message = event.data;

    if (isBridgeCancel(message)) {
      this.inFlight.get(message.operationId)?.abort();
      return;
    }

    if (!isBridgeRequest(message)) {
      return;
    }

    const controller = new AbortController();
    this.inFlight.set(message.operationId, controller);
    try {
      const payload = await this.dispatch(message, controller.signal);
      this.postSuccess({ type: "bridge.success", operationId: message.operationId, payload });
    } catch (error) {
      this.postError(message.operationId, error);
    } finally {
      this.inFlight.delete(message.operationId);
    }
  }

  private isAllowedEvent(event: MessageEvent<unknown>): boolean {
    if ("source" in event && event.source && event.source !== this.webview) {
      return false;
    }

    return isAllowedOrigin(event.origin, this.allowedOrigins);
  }

  private dispatch(
    message: BridgeRequestEnvelope,
    signal: AbortSignal
  ): unknown | Promise<unknown> {
    if (message.type !== "bridge.call") {
      throw new BridgeRemoteError({
        operationId: message.operationId,
        remoteName: "UnsupportedBridgeOperation",
        remoteMessage: `Unsupported bridge operation: ${message.type}`,
        code: "ERR_UNSUPPORTED_OPERATION"
      });
    }

    return this.dispatchCall(message.payload as BridgeCallPayload, { signal });
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
}

export function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.endsWith(":")) {
      return origin.startsWith(allowedOrigin);
    }
    return origin === allowedOrigin;
  });
}

function normalizeError(error: unknown): BridgeErrorEnvelope["error"] {
  if (error instanceof BridgeRemoteError) {
    return {
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage,
      remoteStack: error.remoteStack,
      code: error.code
    };
  }

  if (error instanceof Error) {
    return {
      remoteName: error.name,
      remoteMessage: error.message,
      remoteStack: error.stack
    };
  }

  return {
    remoteName: "Error",
    remoteMessage: String(error)
  };
}

function isBridgeRequest(message: unknown): message is BridgeRequestEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<BridgeRequestEnvelope>;
  return typeof candidate.operationId === "string" && candidate.type === "bridge.call";
}

function isBridgeCancel(message: unknown): message is BridgeCancelEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<BridgeCancelEnvelope>;
  return typeof candidate.operationId === "string" && candidate.type === "bridge.cancel";
}
