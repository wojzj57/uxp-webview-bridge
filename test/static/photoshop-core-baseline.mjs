/**
 * Adobe Photoshop Core parity baseline pinned by the 2026-07-27 gap review.
 *
 * Keep this independent from the vendored Core declaration: that declaration is
 * known to omit nine documented members, so deriving the baseline from it would
 * make the parity gate silently accept the same drift it is meant to catch.
 */
export const ADOBE_PHOTOSHOP_CORE_MEMBERS = [
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
];

export const PHOTOSHOP_CORE_CALLBACK_MEMBERS = [
  "addNotificationListener",
  "removeNotificationListener",
  "executeAsModal"
];

const callbackMembers = new Set(PHOTOSHOP_CORE_CALLBACK_MEMBERS);

export const PHOTOSHOP_CORE_NON_CALLBACK_MEMBERS = ADOBE_PHOTOSHOP_CORE_MEMBERS.filter(
  (member) => !callbackMembers.has(member)
);
