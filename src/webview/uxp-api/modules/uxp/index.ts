import { createUnimplementedNamespace } from "../../../unimplemented-namespace.js";
import { getBridgeRpcClient } from "../../../runtime.js";
import {
  secureStorageTransportToUint8Array,
  secureStorageValueToTransport,
  UXP_MODULE_ID,
  type UxpPlugin,
  type UxpSerializedPlugin,
  type UxpNamespace
} from "../../../../shared/contracts/uxp.js";

interface UxpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpNamespace(rpc: UxpRpc): UxpNamespace {
  const createPlugin = (plugin: UxpSerializedPlugin): UxpPlugin => ({
    ...plugin,
    showPanel: (panelId) => rpc.call<void | string>(UXP_MODULE_ID, "plugin.showPanel", [plugin.id, panelId]),
    invokeCommand: (commandId, ...params) =>
      rpc.call<void>(UXP_MODULE_ID, "plugin.invokeCommand", [plugin.id, commandId, ...params])
  });

  return {
    host: {
      get name() {
        return rpc.call<string>(UXP_MODULE_ID, "host.name");
      },
      get version() {
        return rpc.call<string>(UXP_MODULE_ID, "host.version");
      },
      get uiLocale() {
        return rpc.call<string>(UXP_MODULE_ID, "host.uiLocale");
      }
    },
    versions: {
      get uxp() {
        return rpc.call<string>(UXP_MODULE_ID, "versions.uxp");
      },
      get plugin() {
        return rpc.call<string>(UXP_MODULE_ID, "versions.plugin");
      }
    },
    storage: {
      secureStorage: {
        get length() {
          return rpc.call<number>(UXP_MODULE_ID, "storage.secureStorage.length");
        },
        setItem(key, value) {
          return rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.setItem", [
            key,
            secureStorageValueToTransport(value)
          ]);
        },
        async getItem(key) {
          const value = await rpc.call<ReturnType<typeof secureStorageValueToTransport>>(
            UXP_MODULE_ID,
            "storage.secureStorage.getItem",
            [key]
          );
          return secureStorageTransportToUint8Array(value);
        },
        removeItem: (key) =>
          rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.removeItem", [key]),
        key: (index) => rpc.call<string>(UXP_MODULE_ID, "storage.secureStorage.key", [index]),
        clear: () => rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.clear")
      },
      localFileSystem: createUnimplementedNamespace("uxp.storage.localFileSystem")
    },
    shell: {
      openPath: (path, developerText) =>
        rpc.call<string>(UXP_MODULE_ID, "shell.openPath", [path, developerText]),
      openExternal: (url, developerText) =>
        rpc.call<string>(UXP_MODULE_ID, "shell.openExternal", [String(url), developerText])
    },
    userInfo: {
      userId: () => rpc.call<string>(UXP_MODULE_ID, "userInfo.userId")
    },
    pluginManager: {
      get plugins() {
        return rpc
          .call<readonly UxpSerializedPlugin[]>(UXP_MODULE_ID, "pluginManager.plugins")
          .then((plugins) => new Set(plugins.map(createPlugin)));
      }
    },
    script: {
      get args() {
        return rpc.call<readonly unknown[]>(UXP_MODULE_ID, "script.args");
      },
      get executionContext() {
        return rpc.call<unknown>(UXP_MODULE_ID, "script.executionContext");
      },
      setResult: (result) => rpc.call<void>(UXP_MODULE_ID, "script.setResult", [result])
    }
  };
}

export const uxp: UxpNamespace = createUxpNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

export type { UxpNamespace } from "../../../../shared/contracts/uxp.js";
