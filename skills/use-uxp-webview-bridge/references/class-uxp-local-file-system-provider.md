# `UxpLocalFileSystemProvider`

Concrete `uxp.storage.localFileSystem` provider.

- `getFileForOpening(options?) -> File | File[] | null`
- `getFileForSaving(suggestedName?, options?) -> File | null`
- `getFolder(options?) -> Folder | null`
- `getTemporaryFolder()`, `getDataFolder()`, `getPluginFolder()`
- `createEntryWithUrl(url, { type?, overwrite? })`, `getEntryWithUrl(url)`
- `getFsUrl(entry)`, `getNativePath(entry)`
- `createSessionToken(entry)`, `getEntryForSessionToken(token)`
- `createPersistentToken(entry)`, `getEntryForPersistentToken(token)`

Picker options accept `initialDomain`, allowed extensions/types, optional initial entry, and `allowMultiple` for opening. Session tokens last for the current plugin session; persistent tokens are intended to be stored and resolved later. Resolution can fail if access was revoked or the entry moved.

The bridge type always returns `File | File[] | null` from `getFileForOpening`, even when `allowMultiple: false`; normalize both shapes. `types` is a string array forwarded to native UXP without normalization, so use the extension/type notation required by the target host.

The `persistentFileStorage` capability names the whole storage bridge surface. It is separate from a persistent token, which is only one provider feature for resolving an approved entry across plugin sessions.
