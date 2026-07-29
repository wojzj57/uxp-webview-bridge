[简体中文](./zh/fetch.md)

# Forwarded fetch

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

**Forwarded fetch** accepts the familiar WebView `fetch(input, init)` shape, serializes the request, performs the real request with the UXP host's global fetch, and reconstructs a native `Response` in the WebView. Because the host performs the request, WebView CORS enforcement does not apply; UXP manifest network permission and bridge trust still do.

Forwarded fetch is controlled by the `fetch` bridge capability, which defaults to enabled. Disable it explicitly when the WebView does not need host-forwarded network access, and do not expose it to untrusted WebView origins.

## Direct use

Configure the WebView bridge first, then import `fetch` under a descriptive local name.

```ts
import {
  configWebviewBridge,
  fetch as forwardedFetch
} from "uxp-webview-bridge/webview";

const runtime = configWebviewBridge();

try {
  const response = await forwardedFetch("https://example.com/data.json", {
    headers: { Accept: "application/json" },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  console.log(await response.json());
} finally {
  runtime.destroy();
}
```

The UXP manifest must allow the target network domain. Avoid putting secrets in URLs or logs.

## Abort a request

An `AbortSignal` sends a bridge cancel envelope for the in-flight operation. Aborting is best effort across the transport and host fetch boundary.

```ts
import { fetch as forwardedFetch } from "uxp-webview-bridge/webview";

const controller = new AbortController();
const request = forwardedFetch("https://example.com/slow", {
  signal: controller.signal
});

controller.abort();

try {
  await request;
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.log("Request aborted");
  } else {
    throw error;
  }
}
```

## Install as the global fetch

`installFetch()` is opt-in. It mutates module-global installation state and `globalThis.fetch`, and returns an uninstaller that restores the captured previous global. Use one global owner at a time and a deterministic `try/finally` boundary.

```ts
import {
  configWebviewBridge,
  installFetch
} from "uxp-webview-bridge/webview";

const runtime = configWebviewBridge();
const uninstallFetch = installFetch();

try {
  const response = await globalThis.fetch("https://example.com/data.txt");
  console.log(await response.text());
} finally {
  uninstallFetch();
  runtime.destroy();
}
```

Installation is not reference-counted. Overlapping owners cannot uninstall independently: any active uninstaller can restore the captured previous global for all owners. Libraries that assume browser-only fetch details may still be incompatible.

## Supported request shapes

The implementation and public types support:

- string, `URL`, and `Request` address inputs;
- method and header overrides;
- text, `URLSearchParams`, `FormData`, `Blob`, `ArrayBuffer`, and `ArrayBufferView` bodies supplied through `init.body`;
- redirect modes `follow`, `error`, and `manual` when provided;
- abort propagation through `AbortSignal`.

Contract tests exercise string input; text, `URLSearchParams`, and `FormData` bodies supplied through `init`; `ReadableStream` rejection from `init.body`; response reconstruction; failure mapping; and abort behavior. The other supported shapes above come from the implementation and public types rather than dedicated shape tests.

Supported bodies must be supplied through `init.body`. A `Request` input contributes only its URL, method, and headers; its body is not forwarded. A `ReadableStream` supplied through `init.body` is rejected.

The bridge reconstructs a native WebView `Response` with transported status, status text, headers, and buffered body for normal body consumption methods.

## Limits and error behavior

> **Buffering warning:** supported request bodies and response bodies are fully buffered in memory, and streaming responses are not supported. Size payloads for the UXP process and WebView memory budget.

Transport or remote request failures are mapped to `TypeError` with the remote failure attached as `cause`. Abort failures retain abort semantics where the environment supports them. Inspect `cause` for diagnostics without exposing secrets.

Forwarded fetch does **not** claim full Fetch Standard parity. In particular, do not assume streaming, browser cookie/credential equivalence, browser cache behavior, or response URL/type/redirect metadata that the transport does not carry.

## Security checklist

- Allow only required domains in `requiredPermissions.network`; the broad `"all"` value in the repository fixture is test-only.
- Keep `allowedOrigins` and WebView domain policy narrow, and disable the `fetch` capability unless the WebView needs host-forwarded requests.
- Validate caller-controlled URLs, methods, headers, and bodies at the application boundary.
- Avoid forwarding credentials for untrusted content and keep secrets out of URLs/logs.
- Prefer direct `forwardedFetch` for application-owned code. Use global installation only when a dependency requires it and one component can own its complete lifecycle.
