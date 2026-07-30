import type { BridgeCapabilityName } from "../shared/capabilities.js";
import { BridgeRemoteError } from "../shared/errors.js";
import type { BridgeCallPayload } from "../shared/types.js";
import type {
  BridgeCallbackInvocationMode,
  BridgeCallbackReference
} from "../shared/protocol.js";
import type { BridgeOwnedModalCoordinator } from "./bridge-owned-modal-coordinator.js";
import {
  resolvePhotoshopExecutionClass,
  type PhotoshopExecutionClass
} from "./photoshop-execution-catalog.js";

export interface UxpDispatchContext {
  readonly bridgeSessionId?: string;
  readonly modalCoordinator?: BridgeOwnedModalCoordinator;
  readonly signal?: AbortSignal;
  readonly operationId: string;
  readonly modalSessionId?: string;
  readonly callbacks: UxpCallbackBridge;
  readonly executionClass?: PhotoshopExecutionClass;
}

export interface UxpCallbackInvokeOptions {
  readonly mode?: BridgeCallbackInvocationMode;
  readonly subscriptionId?: string;
  readonly modalSessionId?: string;
  readonly parentOperationId?: string;
}

export interface UxpModalSession {
  readonly modalSessionId: string;
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
  readonly resolveCapability: (method: string) => BridgeCapabilityName;
  dispatch(
    method: string,
    args: readonly unknown[],
    context: UxpDispatchContext
  ): unknown;
  destroy?(): void | Promise<void>;
}

export interface UxpDispatchOptions {
  readonly bridgeSessionId?: string;
  readonly modalCoordinator?: BridgeOwnedModalCoordinator;
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
  capabilities: ReadonlySet<BridgeCapabilityName>,
  adapters: readonly UxpModuleAdapter[]
): UxpModuleRegistry {
  const adapterByModuleId = new Map(adapters.map((adapter) => [adapter.moduleId, adapter]));

  return {
    dispatch(payload, options) {
      const adapter = adapterByModuleId.get(payload.module);
      if (!adapter) {
        throw new Error(`Unsupported bridge module: ${payload.module}`);
      }

      const capability = adapter.resolveCapability(payload.method);
      if (!capabilities.has(capability)) {
        const operationId = options?.operationId ?? "bridge.direct-dispatch";
        throw new BridgeRemoteError({
          operationId,
          remoteName: "BridgeCapabilityError",
          remoteMessage: `Bridge capability ${capability} denied operation ${operationId}.`,
          code: "ERR_BRIDGE_CAPABILITY_DISABLED",
          capability,
          module: payload.module,
          method: payload.method
        });
      }

      const executionClass = resolvePhotoshopExecutionClass(payload.module, payload.method);
      const context: UxpDispatchContext = {
        operationId: options?.operationId ?? "bridge.direct-dispatch",
        callbacks: options?.callbacks ?? unavailableCallbacks,
        ...(options?.bridgeSessionId === undefined ? {} : { bridgeSessionId: options.bridgeSessionId }),
        ...(options?.modalCoordinator === undefined ? {} : { modalCoordinator: options.modalCoordinator }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
        ...(options?.modalSessionId === undefined ? {} : { modalSessionId: options.modalSessionId }),
        ...(executionClass === undefined ? {} : { executionClass })
      };
      return adapter.dispatch(payload.method, payload.args, context);
    }
  };
}

export function fixedCapability(
  capability: BridgeCapabilityName,
  assertMethod: (method: string) => void
): (method: string) => BridgeCapabilityName {
  return (method) => {
    assertMethod(method);
    return capability;
  };
}
export function assertPhotoshopExecutionClass(
  context: UxpDispatchContext | undefined,
  ...allowed: readonly PhotoshopExecutionClass[]
): void {
  if (context?.executionClass === undefined || allowed.includes(context.executionClass)) return;
  throw new Error(
    `Photoshop execution catalog classified this call as ${context.executionClass}; expected ${allowed.join(" or ")}.`
  );
}
