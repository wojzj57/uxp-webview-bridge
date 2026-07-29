# `uxp.storage.localFileSystem` module

Capability: `persistentFileStorage` (default enabled). The UXP manifest may require local filesystem access.

Provider methods include open/save/folder pickers; temporary, data, and plugin folders; URL entry creation/lookup; FS/native path conversion; and session/persistent token creation/resolution. See [UxpLocalFileSystemProvider](class-uxp-local-file-system-provider.md).

The storage namespace also exposes synchronous class-shaped compatibility facades and constant tables: `Entry`, `File`, `Folder`, `FileSystemProvider`, `LocalFileSystemProvider`, `domains`, `formats`, `modes`, `types`, `fileTypes`, and `errors`. The class-shaped values cannot be directly constructed; obtain remote objects from provider/folder calls and use their static type guards.

Use `File.isFile(entry)` and `Folder.isFolder(entry)` for type narrowing. Dispose entries when they are no longer needed.

Related: [provider](class-uxp-local-file-system-provider.md), [Entry](class-uxp-storage-entry.md), [File](class-uxp-storage-file.md), and [Folder](class-uxp-storage-folder.md).
