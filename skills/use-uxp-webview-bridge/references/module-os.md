# `os` module

Import `os` from `uxp-webview-bridge/webview`. Capability: `os` (default enabled). All calls are asynchronous and read-only.

- `platform()`
- `release()`
- `arch()`
- `cpus()`
- `totalmem()`
- `freemem()`
- `homedir()`

```ts
const [platform, arch, free] = await Promise.all([
  os.platform(), os.arch(), os.freemem()
]);
```
