import { getBridgeRpcClient } from "@webview/runtime.js";
import type { UxpNamespace } from "./types.js";
import { createUxpHostNamespace } from "./host/index.js";
import { createUxpKeyValueStorageNamespace } from "./key-value-storage/index.js";
import { createUxpPersistentFileStorageNamespace } from "./persistent-file-storage/index.js";
import { createUxpPluginManagerNamespace } from "./plugin-manager/index.js";
import { createUxpShellNamespace } from "./shell/index.js";
import { createUxpUserInfoNamespace } from "./user-info/index.js";
import { createUxpVersionsNamespace } from "./versions/index.js";
import { createUxpXmpNamespace } from "./xmp/index.js";

interface UxpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpNamespace(rpc: UxpRpc): UxpNamespace {
  return {
    host: createUxpHostNamespace(rpc),
    pluginManager: createUxpPluginManagerNamespace(rpc),
    shell: createUxpShellNamespace(rpc),
    storage: {
      ...createUxpPersistentFileStorageNamespace(rpc),
      ...createUxpKeyValueStorageNamespace(rpc)
    },
    userInfo: createUxpUserInfoNamespace(rpc),
    versions: createUxpVersionsNamespace(rpc),
    xmp: createUxpXmpNamespace(rpc)
  };
}

export const uxp: UxpNamespace = createUxpNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
