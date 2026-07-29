# `UxpStorageEntry`

Base remote object for UXP filesystem entries. Obtain entries from `uxp.storage.localFileSystem` or folder methods; do not call `new Entry()`.

Synchronous snapshot fields: `isEntry`, `isFile`, `isFolder`, `name`, `provider`, optional `url`, optional `nativePath`.

Methods:

- `toString()`
- `copyTo(folder, { overwrite?, allowFolderCopy? }) -> UxpStorageEntry`
- `moveTo(folder, { overwrite?, newName? })`
- `delete()`
- `getMetadata()` with size and converted `Date` fields
- `dispose()`

`copyTo` returns a promise-like `RemoteResult`. Dispose entries after use; moving or deleting may invalidate existing references.
