# `uxp` root module

Import `uxp` from `uxp-webview-bridge/webview`. It groups:

- `host` and `versions` (always registered)
- `shell`, `userInfo`, `pluginManager`
- `storage.secureStorage`
- `storage.localFileSystem` plus constructors/constants
- `xmp`

```ts
const [hostName, uxpVersion] = await Promise.all([
  uxp.host.name,
  uxp.versions.uxp
]);
```

Each child namespace has its own capability and reference. Do not import Adobe's native `uxp` module in WebView code.
