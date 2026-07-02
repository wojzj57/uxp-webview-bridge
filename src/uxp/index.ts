import { mergeCapabilities } from "../shared/capabilities.js";
import type { BridgeCapabilities } from "../shared/types.js";
import { createUxpModuleRegistry } from "./module-registry.js";
import { RpcHost, type UxpWebViewElement } from "./rpc-host.js";
import { osModuleAdapter } from "./uxp-api/modules/os/host.js";

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
  const registry = createUxpModuleRegistry(capabilities, [osModuleAdapter]);
  const host = new RpcHost({
    webview: options.webview,
    allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    dispatchCall: (payload) => registry.dispatch(payload)
  });

  return {
    destroy: () => host.destroy()
  };
}
