import type { BridgeCallPayload, BridgeCapabilities } from "../shared/types.js";
import type {
  BridgeCallbackInvocationMode,
  BridgeCallbackReference
} from "../shared/protocol.js";

export type CapabilityName = {
  readonly [K in keyof BridgeCapabilities]: BridgeCapabilities[K] extends boolean ? K : never;
}[keyof BridgeCapabilities];

export interface UxpDispatchContext {
  readonly capabilities: BridgeCapabilities;
  readonly signal?: AbortSignal;
  readonly operationId: string;
  readonly modalSessionId?: string;
  readonly callbacks: UxpCallbackBridge;
}

export interface UxpCallbackInvokeOptions {
  readonly mode?: BridgeCallbackInvocationMode;
  readonly subscriptionId?: string;
  readonly sessionId?: string;
  readonly parentOperationId?: string;
}

export interface UxpModalSession {
  readonly sessionId: string;
  invoke<T>(reference: BridgeCallbackReference, args?: readonly unknown[]): Promise<T>;
  close(): Promise<void>;
}

export interface UxpCallbackBridge {
  readonly activeModalSessionId: string | undefined;
  invoke<T>(
    reference: BridgeCallbackReference,
    args?: readonly unknown[],
    options?: UxpCallbackInvokeOptions
  ): Promise<T>;
  registerSubscription(
    subscriptionId: string,
    cleanup: () => void | Promise<void>
  ): void;
  unregisterSubscription(subscriptionId: string): Promise<void>;
  openModalSession(parentOperationId?: string): UxpModalSession;
}

export interface UxpModuleAdapter {
  readonly moduleId: string;
  readonly capability?: CapabilityName;
  dispatch(
    method: string,
    args: readonly unknown[],
    context: UxpDispatchContext
  ): unknown;
  destroy?(): void | Promise<void>;
}

export interface UxpDispatchOptions {
  readonly signal?: AbortSignal;
  readonly operationId: string;
  readonly modalSessionId?: string;
  readonly callbacks: UxpCallbackBridge;
}

const unavailableCallbacks: UxpCallbackBridge = {
  activeModalSessionId: undefined,
  invoke: () => Promise.reject(new Error("Callback invocation is unavailable for direct registry dispatch.")),
  registerSubscription: () => {
    throw new Error("Callback subscriptions are unavailable for direct registry dispatch.");
  },
  unregisterSubscription: () => Promise.resolve(),
  openModalSession: () => {
    throw new Error("Modal sessions are unavailable for direct registry dispatch.");
  }
};

export interface UxpModuleRegistry {
  dispatch(payload: BridgeCallPayload, options?: UxpDispatchOptions): unknown;
}

export function createUxpModuleRegistry(
  capabilities: BridgeCapabilities,
  adapters: readonly UxpModuleAdapter[]
): UxpModuleRegistry {
  const adapterByModuleId = new Map(adapters.map((adapter) => [adapter.moduleId, adapter]));

  return {
    dispatch(payload, options) {
      const adapter = adapterByModuleId.get(payload.module);
      if (!adapter) {
        throw new Error(`Unsupported bridge module: ${payload.module}`);
      }

      if (adapter.capability && !capabilities[adapter.capability]) {
        throw new Error(`${adapter.capability} capability is disabled.`);
      }

      const context: UxpDispatchContext = {
        capabilities,
        operationId: options?.operationId ?? "bridge.direct-dispatch",
        callbacks: options?.callbacks ?? unavailableCallbacks,
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
        ...(options?.modalSessionId === undefined ? {} : { modalSessionId: options.modalSessionId })
      };
      return adapter.dispatch(payload.method, payload.args, context);
    }
  };
}
