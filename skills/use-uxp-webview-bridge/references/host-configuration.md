# Host configuration

Import only from `uxp-webview-bridge/uxp` in the UXP host bundle.

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";

const runtime = configUxpBridge({
  webview,
  allowedOrigins: ["https://app.example.com"],
  capabilities: {
    fs: false,
    os: false,
    clipboard: false,
    localStorage: false,
    sessionStorage: false,
    fetch: true,
    shell: false,
    userInfo: false,
    pluginManager: false,
    keyValueStorage: false,
    persistentFileStorage: false,
    xmp: false,
    photoshop: false,
    imaging: false,
    batchPlay: false
  },
  callbackTimeoutMs: 60_000,
  temporaryDocumentTimeoutMs: 30 * 60_000
});
```

`ConfigUxpBridgeOptions`:

- `webview` is required and must expose `postMessage(message)`.
- `allowedOrigins` appends trusted origins to built-in local origins.
- `capabilities` is a partial override of defaults; omitted keys remain enabled.
- `callbackTimeoutMs` defaults to 60 seconds; `0` disables callback timeout.
- `temporaryDocumentTimeoutMs` defaults to 30 minutes for bridge-owned temporary Photoshop documents.

For least privilege, specify the complete capability object as above. A short partial object is convenient only when retaining all other default-enabled modules is intentional.

Expose a controlled teardown path that awaits `runtime.destroy()`. An unload handler can only start best-effort async cleanup (`void runtime.destroy()`); do not claim the browser unload event waits for it. Destruction aborts operations, releases callbacks/modal sessions, and destroys adapters/resources. Configure only once per UXP runtime.

The host owns source/origin validation, capability checks, request dispatch, native calls, modal policy, and resource lifecycle. Do not put those responsibilities in WebView code.
