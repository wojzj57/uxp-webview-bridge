import type { BridgeCallPayload, BridgeCapabilities } from "../shared/types.js";

export type CapabilityName = keyof Omit<BridgeCapabilities, "fs">;

export interface UxpDispatchContext {
  readonly capabilities: BridgeCapabilities;
}

export interface UxpModuleAdapter {
  readonly moduleId: string;
  readonly capability?: CapabilityName;
  dispatch(
    method: string,
    args: readonly unknown[],
    context: UxpDispatchContext
  ): unknown | Promise<unknown>;
  destroy?(): void;
}

export interface UxpModuleRegistry {
  dispatch(payload: BridgeCallPayload): unknown | Promise<unknown>;
}

export function createUxpModuleRegistry(
  capabilities: BridgeCapabilities,
  adapters: readonly UxpModuleAdapter[]
): UxpModuleRegistry {
  const adapterByModuleId = new Map(adapters.map((adapter) => [adapter.moduleId, adapter]));

  return {
    dispatch(payload) {
      const adapter = adapterByModuleId.get(payload.module);
      if (!adapter) {
        throw new Error(`Unsupported bridge module: ${payload.module}`);
      }

      if (adapter.capability && !capabilities[adapter.capability]) {
        throw new Error(`${adapter.capability} capability is disabled.`);
      }

      return adapter.dispatch(payload.method, payload.args, { capabilities });
    }
  };
}
