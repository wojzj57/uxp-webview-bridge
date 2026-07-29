# `UxpStorageFile`

Extends `UxpStorageEntry` with `isFile: true`, `isFolder: false`, optional `mode`, and file content methods.

- `read({ format? }): Promise<string | ArrayBuffer>`
- `write(data, { format?, append? }): Promise<number>`

Accepts strings, `ArrayBuffer`, or typed-array views for writes. Use `uxp.storage.File.isFile(value)` to narrow. Pass a file object, not a raw path, to Photoshop open/save APIs. Dispose it when the workflow no longer needs the host entry reference.

Use `uxp.storage.formats.utf8` when a string result is required and `uxp.storage.formats.binary` for binary data. Without a chosen format, keep both documented return types in the caller's handling.
