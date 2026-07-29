# Capabilities and manifest permissions

Bridge capabilities are host dispatch gates, not UXP manifest permissions. Both must allow an operation.

All configurable capabilities default to `true`:

| Capability | Controls |
| --- | --- |
| `fs` | Node-style `fs` namespace |
| `os` | `os` namespace |
| `clipboard` | `clipboard` namespace |
| `localStorage` | async `localStorage` |
| `sessionStorage` | async `sessionStorage` |
| `fetch` | forwarded host `fetch` and installed replacement |
| `shell` | `uxp.shell` |
| `userInfo` | `uxp.userInfo` |
| `pluginManager` | `uxp.pluginManager` |
| `keyValueStorage` | `uxp.storage.secureStorage` |
| `persistentFileStorage` | `uxp.storage.localFileSystem` and Entry/File/Folder proxies |
| `xmp` | `uxp.xmp` |
| `photoshop` | Photoshop DOM, Action, and Core parent gate |
| `imaging` | Photoshop Imaging; also requires `photoshop` |
| `batchPlay` | public `photoshop.action.batchPlay`, `batchPlaySync`, and `photoshop.app.batchPlay`; also requires `photoshop` |

`crypto`, `path`, `uxp.host`, and `uxp.versions` are always registered without a configurable bridge capability.

Disable unneeded capabilities explicitly in `configUxpBridge({ capabilities: ... })`. A disabled call fails before its native module is accessed. Disabling public `batchPlay` does not break private internal DOM implementation calls.

The override is partial, so omitted keys stay enabled. For a least-privilege host, specify all 15 keys explicitly and set only the required ones to `true`; the library has no allowlist shortcut.

Manifest needs depend on actual APIs. Common gates include `clipboard`, `localFileSystem`, `network` domains for forwarded fetch, `launchProcess` schemes/extensions for shell operations, and `enableUserInfo`. A capability cannot grant a missing manifest permission or create an API absent from the installed host.

Manifest v5 baseline (narrow domains/schemes to the product):

```json
{
  "manifestVersion": 5,
  "host": [{ "app": "PS", "minVersion": "24.4.0" }],
  "featureFlags": { "enableSWCSupport": true },
  "requiredPermissions": {
    "webview": {
      "allow": "yes",
      "domains": ["https://app.example.com"],
      "enableMessageBridge": "localAndRemote"
    },
    "network": { "domains": ["https://api.example.com"] },
    "localFileSystem": "request",
    "clipboard": "readAndWrite",
    "launchProcess": { "schemes": ["https"], "extensions": [] },
    "enableUserInfo": true
  }
}
```

This is a fragment, not a complete plugin manifest. Remove unused permissions. `localFileSystem: "request"` is enough for user-approved picker access; use `fullAccess` only for APIs/workflows that truly require arbitrary filesystem access, such as broad `fs` use. Add `allowLocalRendering: "yes"` only for local WebView content on a host version that supports it. `24.4.0` is the repository fixture floor, not a compatibility guarantee for every member; select a host floor from the exact APIs used. Recheck the target host's manifest schema when using another manifest version.

Built-in allowed origins are `plugin:`, `plugin-data:`, `plugin-temp:`, and HTTP/HTTPS loopback origins on `localhost` or `127.0.0.1` with any valid port. `allowedOrigins` only appends. Values ending in `:` trust a whole scheme; other values match an exact normalized origin. Avoid broad `http:` or `https:` entries unless deliberate.
