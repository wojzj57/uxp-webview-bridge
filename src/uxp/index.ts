import { mergeCapabilities } from "../shared/capabilities.js";
import type { BridgeCapabilities } from "../shared/types.js";
import { createUxpModuleRegistry } from "./module-registry.js";
import { RpcHost, type UxpWebViewElement } from "./rpc-host.js";
import { clipboardModuleAdapter } from "./uxp-api/global-members/clipboard/host.js";
import { cryptoModuleAdapter } from "./uxp-api/global-members/crypto/host.js";
import { localStorageModuleAdapter } from "./uxp-api/global-members/local-storage/host.js";
import { pathModuleAdapter } from "./uxp-api/global-members/path/host.js";
import { sessionStorageModuleAdapter } from "./uxp-api/global-members/session-storage/host.js";
import { fetchModuleAdapter } from "./uxp-api/modules/fetch/host.js";
import { fsModuleAdapter } from "./uxp-api/modules/fs/host.js";
import { osModuleAdapter } from "./uxp-api/modules/os/host.js";
import { photoshopModuleAdapter } from "./uxp-api/modules/photoshop/index.js";
import { uxpModuleAdapter } from "./uxp-api/modules/uxp/index.js";

export interface ConfigUxpBridgeOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins?: readonly string[];
  readonly capabilities?: Partial<BridgeCapabilities>;
}

export interface UxpBridgeRuntime {
  destroy(): void;
}

const DEFAULT_ALLOWED_ORIGINS = ["plugin:", "plugin-data:", "plugin-temp:"];

export function configUxpBridge(options: ConfigUxpBridgeOptions): UxpBridgeRuntime {
  const capabilities = mergeCapabilities(options.capabilities);
  const adapters = [
    clipboardModuleAdapter,
    cryptoModuleAdapter,
    fetchModuleAdapter,
    fsModuleAdapter,
    localStorageModuleAdapter,
    osModuleAdapter,
    pathModuleAdapter,
    photoshopModuleAdapter,
    sessionStorageModuleAdapter,
    uxpModuleAdapter
  ];
  const registry = createUxpModuleRegistry(capabilities, adapters);
  const host = new RpcHost({
    webview: options.webview,
    allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    dispatchCall: (payload, dispatchOptions) =>
      registry.dispatch(payload, { signal: dispatchOptions.signal })
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
