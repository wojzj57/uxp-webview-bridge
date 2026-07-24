import type { BridgeCallPayload, BridgeCapabilities } from "../shared/types.js";

export type CapabilityName = {
  readonly [K in keyof BridgeCapabilities]: BridgeCapabilities[K] extends boolean ? K : never;
}[keyof BridgeCapabilities];

export interface UxpDispatchContext {
  readonly capabilities: BridgeCapabilities;
  readonly signal?: AbortSignal;
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

export interface UxpDispatchOptions {
  readonly signal?: AbortSignal;
}

export interface UxpModuleRegistry {
  dispatch(payload: BridgeCallPayload, options?: UxpDispatchOptions): unknown | Promise<unknown>;
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

      const context: UxpDispatchContext =
        options?.signal === undefined
          ? { capabilities }
          : { capabilities, signal: options.signal };
      return adapter.dispatch(payload.method, payload.args, context);
    }
  };
}
