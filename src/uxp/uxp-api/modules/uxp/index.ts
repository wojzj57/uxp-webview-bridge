import {
  assertUxpMethodName,
  UXP_MODULE_ID,
  type UxpMethodName
} from "../../../../shared/contracts/uxp.js";
import type { BridgeCapabilities } from "../../../../shared/types.js";
import type { UxpModuleAdapter } from "../../../module-registry.js";
import { dispatchEntrypointsCall } from "./entrypoints/index.js";
import { dispatchHostPropertyCall } from "./host.js";
import { dispatchPluginManagerCall } from "./plugin-manager.js";
import { dispatchScriptCall } from "./script.js";
import { dispatchShellCall } from "./shell.js";
import { dispatchSecureStorageCall } from "./storage/secure-storage.js";
import { dispatchUserInfoCall } from "./user-info.js";

export const uxpModuleAdapter: UxpModuleAdapter = {
  moduleId: UXP_MODULE_ID,
  dispatch: (method, args, context) =>
    dispatchUxpCall(method, args, context.capabilities)
};

export async function dispatchUxpCall(
  method: string,
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpMethodName(method);

  switch (method) {
    case "host.name":
    case "host.version":
    case "host.uiLocale":
    case "versions.uxp":
    case "versions.plugin":
      return dispatchHostPropertyCall(method, args);

    case "shell.openPath":
    case "shell.openExternal":
      return dispatchShellCall(method, args, capabilities);

    case "userInfo.userId":
      return dispatchUserInfoCall(method, args, capabilities);

    case "pluginManager.plugins":
    case "plugin.showPanel":
    case "plugin.invokeCommand":
      return dispatchPluginManagerCall(method, args, capabilities);

    case "script.args":
    case "script.executionContext":
    case "script.setResult":
      return dispatchScriptCall(method, args, capabilities);

    case "entrypoints.setup":
    case "entrypoints.getPanel":
    case "entrypoints.getCommand":
    case "entrypoints.menuItems.size":
    case "entrypoints.menuItems.getItem":
    case "entrypoints.menuItems.getItemAt":
    case "entrypoints.menuItems.insertAt":
    case "entrypoints.menuItems.removeAt":
    case "entrypoints.menuItem.getLabel":
    case "entrypoints.menuItem.getEnabled":
    case "entrypoints.menuItem.getChecked":
    case "entrypoints.menuItem.setLabel":
    case "entrypoints.menuItem.setEnabled":
    case "entrypoints.menuItem.setChecked":
    case "entrypoints.menuItem.remove":
      return dispatchEntrypointsCall(method, args, capabilities);

    case "storage.secureStorage.length":
    case "storage.secureStorage.setItem":
    case "storage.secureStorage.getItem":
    case "storage.secureStorage.removeItem":
    case "storage.secureStorage.key":
    case "storage.secureStorage.clear":
      return dispatchSecureStorageCall(method, args, capabilities);

    default:
      return assertNever(method);
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp method: ${method as UxpMethodName}`);
}
