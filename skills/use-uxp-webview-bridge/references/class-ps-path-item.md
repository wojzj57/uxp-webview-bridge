# `PsPathItem`

Remote Photoshop path item.

Read-only: `typename`, `id`, `docId`, `parent`, `subPathItems`. Writable queued: `kind`, `name`.

Methods: `deselect`, `duplicate(name?)`, `fillPath`, `makeClippingPath`, `makeSelection`, `remove`, `select`, `strokePath`, `batchGet`, `batchSet`, `dispose`.

`fillPath` accepts a `SolidColorInput` and typed blend/opacity/feather options. `strokePath` accepts a Photoshop tool constant and optional source layer/origin. Mutating calls run modally.
