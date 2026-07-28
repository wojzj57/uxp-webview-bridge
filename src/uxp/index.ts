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
import {
  configureCoreAdapter,
  coreModuleAdapter
} from "./photoshop-api/modules/core/index.js";
import { imagingModuleAdapter } from "./photoshop-api/modules/imaging/index.js";
import { photoshopModuleAdapter } from "./photoshop-api/modules/photoshop/index.js";
import { uxpModuleAdapter } from "./uxp-api/modules/uxp/index.js";

export interface ConfigUxpBridgeOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins?: readonly string[];
  readonly capabilities?: Partial<BridgeCapabilities>;
  /** Host-to-WebView callback timeout. Set to `0` to disable. Defaults to 60 seconds. */
  readonly callbackTimeoutMs?: number;
  /** Maximum lifetime of bridge-owned temporary documents. Defaults to 30 minutes. */
  readonly temporaryDocumentTimeoutMs?: number;
}

export interface UxpBridgeRuntime {
  destroy(): Promise<void>;
}

const DEFAULT_ALLOWED_ORIGINS = ["plugin:", "plugin-data:", "plugin-temp:"];

export function configUxpBridge(options: ConfigUxpBridgeOptions): UxpBridgeRuntime {
  const capabilities = mergeCapabilities(options.capabilities);
  configureCoreAdapter({
    ...(options.temporaryDocumentTimeoutMs === undefined
      ? {}
      : { ttlMs: options.temporaryDocumentTimeoutMs })
  });
  const adapters = [
    clipboardModuleAdapter,
    cryptoModuleAdapter,
    fetchModuleAdapter,
    fsModuleAdapter,
    coreModuleAdapter,
    imagingModuleAdapter,
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
    ...(options.callbackTimeoutMs === undefined ? {} : { callbackTimeoutMs: options.callbackTimeoutMs }),
    dispatchCall: (payload, dispatchOptions) =>
      registry.dispatch(payload, {
        signal: dispatchOptions.signal,
        operationId: dispatchOptions.operationId,
        callbacks: dispatchOptions.callbacks,
        ...(dispatchOptions.modalSessionId === undefined
          ? {}
          : { modalSessionId: dispatchOptions.modalSessionId })
      })
  });

  return {
    destroy: async () => {
      const hostResult = await Promise.allSettled([host.destroy()]);
      const adapterResults = await Promise.allSettled(
        adapters.map(async (adapter) => adapter.destroy?.())
      );
      const failedCleanup = [...hostResult, ...adapterResults].find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failedCleanup) {
        throw failedCleanup.reason;
      }
    }
  };
}
