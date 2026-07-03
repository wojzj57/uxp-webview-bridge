import {
  type UxpSerializedPlugin
} from "../../../../shared/contracts/uxp.js";
import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpPlugin, RemoteUxpPluginManager } from "./types/remote.js";

export function createPluginManagerNamespace(rpc: UxpRpc): RemoteUxpPluginManager {
  return {
    get plugins() {
      return callUxp<readonly UxpSerializedPlugin[]>(rpc, "pluginManager.plugins")
        .then((plugins) => new Set(plugins.map((plugin) => createPlugin(rpc, plugin))));
    }
  };
}

function createPlugin(rpc: UxpRpc, plugin: UxpSerializedPlugin): RemoteUxpPlugin {
  return {
    ...plugin,
    showPanel: (panelId) => callUxp<void | string>(rpc, "plugin.showPanel", [plugin.id, panelId]),
    invokeCommand: (commandId, ...params) =>
      callUxp<void>(rpc, "plugin.invokeCommand", [plugin.id, commandId, ...params])
  };
}
