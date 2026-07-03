import { mergeCapabilities } from "../shared/capabilities.js";
import type { BridgeCapabilities } from "../shared/types.js";
import { createUxpModuleRegistry } from "./module-registry.js";
import { RpcHost, type UxpWebViewElement } from "./rpc-host.js";
import { createFsModuleAdapter } from "./uxp-api/modules/fs/host.js";
import { osModuleAdapter } from "./uxp-api/modules/os/host.js";
import { uxpModuleAdapter } from "./uxp-api/modules/uxp/index.js";

export interface ConfigUxpBridgeOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins?: readonly string[];
  readonly capabilities?: Partial<BridgeCapabilities>;
  readonly resourceTimeoutMs?: number;
}

export interface UxpBridgeRuntime {
  destroy(): void;
}

const DEFAULT_ALLOWED_ORIGINS = ["plugin:", "plugin-data:", "plugin-temp:"];

export function configUxpBridge(options: ConfigUxpBridgeOptions): UxpBridgeRuntime {
  const capabilities = mergeCapabilities(options.capabilities);
  const fsModuleAdapter = createFsModuleAdapter(
    options.resourceTimeoutMs === undefined ? {} : { resourceTimeoutMs: options.resourceTimeoutMs }
  );
  const adapters = [osModuleAdapter, fsModuleAdapter, uxpModuleAdapter];
  const registry = createUxpModuleRegistry(capabilities, adapters);
  const host = new RpcHost({
    webview: options.webview,
    allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    dispatchCall: (payload) => registry.dispatch(payload)
  });

  return {
    destroy: () => {
      host.destroy();
      for (const adapter of adapters) {
        adapter.destroy?.();
      }
    }
  };
}
