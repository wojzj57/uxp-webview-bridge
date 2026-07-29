# `fs` module

Import `fs` from `uxp-webview-bridge/webview`. Capability: `fs` (default enabled). The UXP manifest may require filesystem access.

Supported methods:

- `readFile(path, options?) -> string | ArrayBuffer`
- `writeFile(path, string | ArrayBuffer | view, options?) -> number`
- `open(path, flag?, mode?) -> fd`, `close(fd)`
- `read(fd, buffer, offset, length, position) -> { bytesRead, buffer }`
- `write(fd, buffer, offset, length, position) -> { bytesWritten, buffer }`
- `lstat(path) -> FsStats`
- `rename`, `copyFile`, `unlink`, `mkdir`, `rmdir`, `readdir`

`FsStats` exposes dates/numeric metadata and `isFile()`, `isDirectory()`, `isSymbolicLink()` predicates. Close descriptors explicitly; the host idle-closes leaked descriptors after about 60 seconds.

```ts
await fs.writeFile("plugin-data:/settings.json", JSON.stringify(data), { encoding: "utf-8" });
const text = await fs.readFile("plugin-data:/settings.json", { encoding: "utf-8" });
```
