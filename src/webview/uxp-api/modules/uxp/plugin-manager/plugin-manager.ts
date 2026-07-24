import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpPlugin, UxpPluginManager, UxpSerializedPlugin } from "./types.js";

interface UxpPluginManagerRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpPluginManagerNamespace(rpc: UxpPluginManagerRpc): UxpPluginManager {
  return {
    get plugins() {
      return readPlugins(rpc);
    }
  };
}

async function readPlugins(rpc: UxpPluginManagerRpc): Promise<readonly UxpPlugin[]> {
  const plugins = await rpc.call<UxpSerializedPlugin[]>(UXP_MODULE_ID, "pluginManager.plugins");
  return plugins.map((plugin) => createPluginProxy(rpc, plugin));
}

function createPluginProxy(rpc: UxpPluginManagerRpc, plugin: UxpSerializedPlugin): UxpPlugin {
  return {
    ...plugin,
    showPanel: (panelId) => rpc.call<void | string>(UXP_MODULE_ID, "plugin.showPanel", [plugin.id, panelId]),
    invokeCommand: (commandId, ...params) =>
      rpc.call<void>(UXP_MODULE_ID, "plugin.invokeCommand", [plugin.id, commandId, ...params])
  };
}
