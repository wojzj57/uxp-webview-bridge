import { getBridgeRpcClient } from "../../../runtime.js";
import { createEntrypointsNamespace } from "./entrypoints/index.js";
import { createHostNamespace } from "./host.js";
import { createPluginManagerNamespace } from "./plugin-manager.js";
import type { UxpRpc } from "./rpc.js";
import { createScriptNamespace } from "./script.js";
import { createShellNamespace } from "./shell.js";
import { createStorageNamespace } from "./storage/index.js";
import { createUserInfoNamespace } from "./user-info.js";
import type { RemoteUxpNamespace } from "./types/remote.js";
import { createVersionsNamespace } from "./versions.js";
import { createUnsupportedXmpNamespace } from "./xmp/index.js";

export function createUxpNamespace(rpc: UxpRpc): RemoteUxpNamespace {
  return {
    host: createHostNamespace(rpc),
    versions: createVersionsNamespace(rpc),
    storage: createStorageNamespace(rpc),
    shell: createShellNamespace(rpc),
    userInfo: createUserInfoNamespace(rpc),
    pluginManager: createPluginManagerNamespace(rpc),
    script: createScriptNamespace(rpc),
    entrypoints: createEntrypointsNamespace(rpc),
    xmp: createUnsupportedXmpNamespace()
  };
}

export const uxp: RemoteUxpNamespace = createUxpNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

export type { RemoteUxpNamespace as UxpNamespace } from "./types/remote.js";
