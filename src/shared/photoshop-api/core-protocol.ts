/** Runtime-neutral protocol for the `photoshop.core` bridge surface. */

export const PHOTOSHOP_CORE_MODULE_ID = "photoshop-api/modules/core";

/**
 * Fixed Adobe Core baseline: one property and thirty functions.
 *
 * Keep this independent from the RPC method list so callback infrastructure gaps cannot silently
 * disappear from parity checks merely because all currently routable calls are present.
 */
export const ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES = [
  "apiVersion",
  "addNotificationListener",
  "calculateDialogSize",
  "convertColor",
  "convertGlobalToLocal",
  "createTemporaryDocument",
  "deleteTemporaryDocument",
  "endModalToolState",
  "executeAsModal",
  "getActiveTool",
  "getCPUInfo",
  "getDisplayConfiguration",
  "getGPUInfo",
  "getLayerGroupContents",
  "getLayerGroupContentsSync",
  "getLayerTree",
  "getLayerTreeSync",
  "getMenuCommandState",
  "getMenuCommandTitle",
  "getPluginInfo",
  "getUserIdleTime",
  "historySuspended",
  "isModal",
  "performMenuCommand",
  "redrawDocument",
  "removeNotificationListener",
  "setExecutionMode",
  "setUserIdleTime",
  "showAlert",
  "suppressResizeGripper",
  "translateUIString"
] as const;

export const PHOTOSHOP_CORE_CALLBACK_MEMBER_NAMES = [
  "addNotificationListener",
  "removeNotificationListener",
  "executeAsModal"
] as const;

export const PHOTOSHOP_CORE_METHOD_NAMES = [
  "core.apiVersion",
  "core.addNotificationListener",
  "core.calculateDialogSize",
  "core.convertColor",
  "core.convertGlobalToLocal",
  "core.createTemporaryDocument",
  "core.deleteTemporaryDocument",
  "core.endModalToolState",
  "core.executeAsModal",
  "core.getActiveTool",
  "core.getCPUInfo",
  "core.getDisplayConfiguration",
  "core.getGPUInfo",
  "core.getLayerGroupContents",
  "core.getLayerGroupContentsSync",
  "core.getLayerTree",
  "core.getLayerTreeSync",
  "core.getMenuCommandState",
  "core.getMenuCommandTitle",
  "core.getPluginInfo",
  "core.getUserIdleTime",
  "core.historySuspended",
  "core.isModal",
  "core.performMenuCommand",
  "core.redrawDocument",
  "core.removeNotificationListener",
  "core.setExecutionMode",
  "core.setUserIdleTime",
  "core.showAlert",
  "core.suppressResizeGripper",
  "core.translateUIString"
] as const;

export const PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES = [
  "modal.reportProgress",
  "modal.suspendHistory",
  "modal.resumeHistory",
  "modal.registerAutoCloseDocument",
  "modal.unregisterAutoCloseDocument"
] as const;

export type PhotoshopCoreMethodName = (typeof PHOTOSHOP_CORE_METHOD_NAMES)[number];
export type PhotoshopCoreInternalMethodName =
  (typeof PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES)[number];
export type PhotoshopCoreRpcMethodName =
  | PhotoshopCoreMethodName
  | PhotoshopCoreInternalMethodName;

const PHOTOSHOP_CORE_METHOD_SET = new Set<string>(PHOTOSHOP_CORE_METHOD_NAMES);
const PHOTOSHOP_CORE_RPC_METHOD_SET = new Set<string>([
  ...PHOTOSHOP_CORE_METHOD_NAMES,
  ...PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES
]);

export function isPhotoshopCoreMethodName(method: string): method is PhotoshopCoreMethodName {
  return PHOTOSHOP_CORE_METHOD_SET.has(method);
}

export function isPhotoshopCoreRpcMethodName(method: string): method is PhotoshopCoreRpcMethodName {
  return PHOTOSHOP_CORE_RPC_METHOD_SET.has(method);
}

export function assertPhotoshopCoreRpcMethodName(
  method: string
): asserts method is PhotoshopCoreRpcMethodName {
  if (!isPhotoshopCoreRpcMethodName(method)) {
    throw new Error(`Unsupported photoshop core method: ${method}`);
  }
}

export function assertPhotoshopCoreMethodName(
  method: string
): asserts method is PhotoshopCoreMethodName {
  if (!isPhotoshopCoreMethodName(method)) {
    throw new Error(`Unsupported photoshop core method: ${method}`);
  }
}
