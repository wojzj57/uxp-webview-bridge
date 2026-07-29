# `photoshop.core` module

Capability: `photoshop`. Methods unavailable in the installed Photoshop host reject with a coded remote error.

Surface:

- Metadata/hardware/UI: `apiVersion`, `calculateDialogSize`, `getActiveTool`, `getCPUInfo`, `getGPUInfo`, `getDisplayConfiguration`, `getPluginInfo`, `translateUIString`.
- Color/coordinates: `convertColor`, `convertGlobalToLocal`.
- Documents/layers: `createTemporaryDocument`, `deleteTemporaryDocument`, `redrawDocument`, `getLayerGroupContents`, `getLayerGroupContentsSync`, `getLayerTree`, `getLayerTreeSync`, `historySuspended`.
- Modal/execution: `executeAsModal`, `endModalToolState`, `isModal`, `setExecutionMode`.
- Menus: `getMenuCommandState`, `getMenuCommandTitle`, `performMenuCommand`.
- Notifications: `addNotificationListener(group, events, listener)`, matching removal.
- Miscellaneous: user idle time get/set, `showAlert`, `suppressResizeGripper`.

`executeAsModal(target, { commandName, descriptor?, interactive?, timeOut? })` passes an `ExecutionContext` with cancellation state, progress reporting, and history/document host control. Await nested bridge calls inside the callback.
