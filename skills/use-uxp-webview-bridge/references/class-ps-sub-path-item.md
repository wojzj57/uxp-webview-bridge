# `PsSubPathItem`

Read-only remote subpath.

Async properties: `typename`, `parent`, `operation`, `closed`, `pathPoints`. Supports `batchGet`, empty `batchSet`, and `dispose`.

Obtain it by indexing `await pathItem.subPathItems`; construct new path definitions with the local `SubPathInfo` value class instead.
