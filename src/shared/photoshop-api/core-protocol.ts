/** Runtime-neutral protocol for the read-only `photoshop.core` bridge module. */

export const PHOTOSHOP_CORE_MODULE_ID = "photoshop-api/modules/core";

export const PHOTOSHOP_CORE_METHOD_NAMES = [
  "core.apiVersion",
  "core.getActiveTool",
  "core.getCPUInfo",
  "core.getDisplayConfiguration",
  "core.getGPUInfo",
  "core.getMenuCommandState",
  "core.getMenuCommandTitle",
  "core.getPluginInfo",
  "core.getUserIdleTime",
  "core.historySuspended",
  "core.isModal",
  "core.translateUIString"
] as const;

export type PhotoshopCoreMethodName = (typeof PHOTOSHOP_CORE_METHOD_NAMES)[number];

const PHOTOSHOP_CORE_METHOD_SET = new Set<string>(PHOTOSHOP_CORE_METHOD_NAMES);

export function isPhotoshopCoreMethodName(method: string): method is PhotoshopCoreMethodName {
  return PHOTOSHOP_CORE_METHOD_SET.has(method);
}

export function assertPhotoshopCoreMethodName(
  method: string
): asserts method is PhotoshopCoreMethodName {
  if (!isPhotoshopCoreMethodName(method)) {
    throw new Error(`Unsupported photoshop core method: ${method}`);
  }
}
