# `CountItems`

Read-only array-like snapshot from `document.countItems`, with `typename` and `parent`.

Methods: `add(position)`, `removeAllFromActiveGroup`, `getAll`, `createGroup`, `renameActiveGroup`, `removeGroupByIndex`, `toggleActiveGroupVisibility`, `activateGroupByIndex`, `setActiveMarkerSize`, `setActiveLabelSize`, `setActiveColor`.

`getAll()` returns a new snapshot. Re-read or call it after mutations.
