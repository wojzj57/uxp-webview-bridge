# `UxpFileSystemProvider`

Base provider view with synchronous fields:

- `isFileSystemProvider: true`
- `supportedDomains: readonly symbol[]`

Use `uxp.storage.FileSystemProvider.isFileSystemProvider(value)` for runtime type narrowing. The concrete bridge instance is `uxp.storage.localFileSystem`; do not construct providers directly.
