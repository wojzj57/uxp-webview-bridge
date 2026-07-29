# `photoshop.app` module

Capability: `photoshop`; public `app.batchPlay` additionally needs `batchPlay`.

Async/reference properties: `typename`, `preferences`, `displayDialogs` (writable), `activeDocument` (writable), `currentTool`, `actionTree`, `documents`, foreground/background colors (writable), and `fonts`.

Methods:

- `getColorProfiles(colorMode?)`, `convertUnits(...)`, `showAlert(message)`
- `batchPlay(commands, options?)`
- `bringToFront()`, `updateUI()`
- `open(file)` and `createDocument(options?)`
- `batchGet`, `batchSet`

Use a `UxpStorageFile` for `open`; raw `{ path }` is deprecated. `open` and `createDocument` return promise-like remote results. `app.SolidColor`, `PathPointInfo`, and `SubPathInfo` are constructor aliases.

`activeDocument` is typed as a non-null remote document. If Photoshop has no active document, expect native access to reject as a remote error rather than returning a documented `null`; handle that state at the workflow boundary or inspect `documents.length` first.
