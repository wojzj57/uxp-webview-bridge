# Forwarded `fetch` module

Import `fetch` (usually aliased as `hostFetch`) or `installFetch` from `uxp-webview-bridge/webview`. Capability: `fetch` (default enabled). Add network domains to the UXP manifest.

`fetch(input, init)` mirrors the browser signature and returns a WebView `Response`, but the UXP host performs the request. The transported request fields are URL, method, headers, buffered body, and redirect mode; `AbortSignal` controls the bridge operation. Other `RequestInit` fields are not forwarded.

```ts
import { fetch as hostFetch } from "uxp-webview-bridge/webview";
const controller = new AbortController();
const response = await hostFetch("https://api.example.com/status", {
  signal: controller.signal
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const value = await response.json();
```

`installFetch()` replaces `globalThis.fetch` and returns an uninstaller. Prefer a named import unless global replacement is explicitly needed. Requests and responses are fully buffered; request `ReadableStream`s and streaming responses are unsupported.

Prefer a URL/string plus explicit `init.body`. A body already stored inside a `Request` input is not forwarded by the current implementation. The reconstructed response preserves status, status text, headers, and buffered body; do not depend on native response URL/redirect metadata.

Unlike other namespaces, non-abort host/network failures are exposed as `TypeError("Failed to fetch: ...")` for fetch compatibility. Inspect `error.cause` for the original bridge error and its `operationId`/`code`. Abort rejects with the signal's `Error` reason or an `AbortError` DOM exception.
