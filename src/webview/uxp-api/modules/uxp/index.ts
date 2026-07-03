import { createUnimplementedNamespace } from "../../../unimplemented-namespace.js";
import { getBridgeRpcClient } from "../../../runtime.js";
import {
  secureStorageTransportToUint8Array,
  secureStorageValueToTransport,
  UXP_MODULE_ID,
  type UxpCommandInfo,
  type UxpMenuItem,
  type UxpMenuItemInput,
  type UxpMenuItems,
  type UxpPanelInfo,
  type UxpPlugin,
  type UxpSerializedCommandInfo,
  type UxpSerializedMenuItem,
  type UxpSerializedMenuItemsReference,
  type UxpSerializedPanelInfo,
  type UxpSerializedPlugin,
  type UxpNamespace
} from "../../../../shared/contracts/uxp.js";

interface UxpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpNamespace(rpc: UxpRpc): UxpNamespace {
  const createMenuItems = (reference: UxpSerializedMenuItemsReference): UxpMenuItems => ({
    get size() {
      return rpc.call<number>(UXP_MODULE_ID, "entrypoints.menuItems.size", [reference]);
    },
    async getItem(id) {
      const item = await rpc.call<UxpSerializedMenuItem | null>(
        UXP_MODULE_ID,
        "entrypoints.menuItems.getItem",
        [reference, id]
      );
      return item ? createMenuItem(item) : null;
    },
    async getItemAt(index) {
      const item = await rpc.call<UxpSerializedMenuItem | null>(
        UXP_MODULE_ID,
        "entrypoints.menuItems.getItemAt",
        [reference, index]
      );
      return item ? createMenuItem(item) : null;
    },
    insertAt: (index, newItem: UxpMenuItemInput) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItems.insertAt", [reference, index, newItem]),
    removeAt: (index) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItems.removeAt", [reference, index])
  });

  const createMenuItem = (item: UxpSerializedMenuItem): UxpMenuItem => ({
    id: item.itemId,
    get label() {
      return rpc.call<string>(UXP_MODULE_ID, "entrypoints.menuItem.getLabel", [item]);
    },
    get enabled() {
      return rpc.call<boolean>(UXP_MODULE_ID, "entrypoints.menuItem.getEnabled", [item]);
    },
    get checked() {
      return rpc.call<boolean>(UXP_MODULE_ID, "entrypoints.menuItem.getChecked", [item]);
    },
    submenu: item.submenu ? createMenuItems(item.submenu) : undefined,
    parent: item.parent ? createMenuItems(item.parent) : undefined,
    setLabel: (label) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setLabel", [item, label]),
    setEnabled: (enabled) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setEnabled", [item, enabled]),
    setChecked: (checked) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setChecked", [item, checked]),
    remove: () => rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.remove", [item])
  });

  const createPanel = (panel: UxpSerializedPanelInfo): UxpPanelInfo => ({
    ...panel,
    menuItems: createMenuItems(panel.menuItems)
  });

  const createCommand = (command: UxpSerializedCommandInfo): UxpCommandInfo => ({ ...command });

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
    },
    entrypoints: {
      setup() {
        throw new Error("uxp.entrypoints.setup cannot be called from the WebView bridge.");
      },
      async getPanel(id) {
        const panel = await rpc.call<UxpSerializedPanelInfo | null>(
          UXP_MODULE_ID,
          "entrypoints.getPanel",
          [id]
        );
        return panel ? createPanel(panel) : null;
      },
      async getCommand(id) {
        const command = await rpc.call<UxpSerializedCommandInfo | null>(
          UXP_MODULE_ID,
          "entrypoints.getCommand",
          [id]
        );
        return command ? createCommand(command) : null;
      }
    }
  };
}

export const uxp: UxpNamespace = createUxpNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

export type { UxpNamespace } from "../../../../shared/contracts/uxp.js";
