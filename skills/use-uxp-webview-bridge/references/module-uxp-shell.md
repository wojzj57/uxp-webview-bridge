# `uxp.shell` module

Capability: `shell` (default enabled). Configure matching UXP `launchProcess` manifest schemes/extensions.

- `openPath(path, developerText?)` opens a filesystem path.
- `openExternal(url, developerText?)` opens an allowed external URL.

`openExternal` rejects `file:` URLs; use `openPath` for files. Both return the native UXP promise result.
