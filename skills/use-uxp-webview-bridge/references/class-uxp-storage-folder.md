# `UxpStorageFolder`

Extends `UxpStorageEntry` with `isFolder: true` and folder operations:

- `getEntries(): Promise<UxpStorageEntry[]>`
- `createEntry(name, { type?, overwrite? })`
- `createFile(name, { overwrite? })`
- `createFolder(name)`
- `getEntry(filePath)`
- `renameEntry(entry, newName, { overwrite? })`

Creation and lookup methods return promise-like `RemoteResult`s. Use `uxp.storage.Folder.isFolder(value)` for narrowing. Re-run `getEntries()` after mutations; results are snapshots. Dispose returned entries when finished.
