# uxp-webview-bridge

Bridge library for Adobe UXP plugin hosts and WebView clients.

This package is intentionally split by subpath exports:

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";
import { configWebviewBridge, os, photoshop, uxp } from "uxp-webview-bridge/webview";
```

Current status: scaffold only. See `CONTEXT.md` and `docs/uxp-webview-bridge-design.md` for the implementation contract.
