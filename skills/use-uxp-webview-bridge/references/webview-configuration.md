# WebView configuration

Import only from `uxp-webview-bridge/webview` in the WebView bundle.

```ts
import { configWebviewBridge } from "uxp-webview-bridge/webview";

const runtime = configWebviewBridge({
  timeoutMs: 10_000,
  allowedOrigins: ["https://app.example.com"],
  onUnhandledError(error) {
    console.error(error.name, error.message, error.operationId);
  }
});
```

Options:

- `target` optionally supplies a `{ postMessage(message) }` target. Otherwise `window.uxpHost` is required.
- `allowedOrigins` appends fallback origins accepted when a message has no usable source object.
- `timeoutMs` defaults to 10 seconds per request.
- `onUnhandledError` receives asynchronous host listener/callback failures as `BridgeRemoteError`-shaped errors; default handling logs them.

Call `configWebviewBridge()` before using any exported namespace. Configure once, await `runtime.destroy()` during controlled teardown, then reconfigure if needed. An unload handler can start only best-effort cleanup. Destruction cancels pending requests and asks the host to release callbacks and sessions.
