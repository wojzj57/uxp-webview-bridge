# RFC-0002: Forwarded fetch module

Status: ready-for-agent
Source: Grilling/domain-modeling session on forwarded WebView fetch (2026-07-06)
Related: RFC-0001 (bridge.cancel primitive), ADR docs/adr/0001-bridge-cancel-envelope.md, CONTEXT.md ("Forwarded fetch")

## Summary

Add a bridged `fetch` so WebView code can perform HTTP requests that are actually executed on the UXP host, bypassing browser CORS. The WebView serializes the request, the UXP host runs its native `fetch`, reads the full response body into bytes, and returns status, statusText, header tuples, and body; the WebView reconstructs a genuine native `Response`. Exposed as a named export `fetch` from `uxp-webview-bridge/webview` with the standard `fetch(input, init)` signature.

## Context & Problem

A WebView's `fetch` is subject to CORS; the UXP host's `fetch` is not. Plugin WebView code that needs to call arbitrary HTTP APIs currently hits CORS walls. Forwarding the request to the UXP host and returning the response solves this. This RFC delivers the core forwarded-fetch capability; the opt-in `window.fetch` override lives in RFC-0003.

## Design

**Public surface.** A named export `fetch(input, init)` from `uxp-webview-bridge/webview`, matching the standard signature. The global `window.fetch` is never touched by this RFC.

**Request handling (WebView side).** Normalize everything to text or bytes *before* crossing the bridge:
- `input` accepts `string | URL | Request`.
- `init.body` accepts `string`, `Uint8Array`/`ArrayBuffer`, `URLSearchParams`, `Blob`, and `FormData`. `Blob`, `URLSearchParams`, and `FormData` are encoded to bytes using the DOM itself (e.g. reading `new Request(url, { body }).arrayBuffer()`), which also yields the correct generated `Content-Type` (notably the `multipart/form-data; boundary=...` header for `FormData`). `ReadableStream` bodies are rejected with a clear error.
- Forwarded `init` fields: `method`, `headers`, `body`, `signal`, `redirect`. All other init fields (`mode`, `credentials`, `cache`, `referrer`, `referrerPolicy`, `integrity`, `keepalive`) are silently ignored, matching the spec's tolerance of unused init fields.

**Response handling.** The UXP host performs the fetch, eagerly reads the entire response body into bytes (no streaming), and returns `status`, `statusText`, headers as an array of `[name, value]` tuples (preserving duplicates), and the body bytes. The WebView reconstructs a **real** `new Response(bytes, { status, statusText, headers })`, so all native accessors (`.ok`, `.headers`, `.text()`, `.json()`, `.arrayBuffer()`, `.blob()`) work for free.

**Error semantics.** HTTP error statuses (404, 500, …) resolve to a normal `Response` with `ok:false` — never reject. Actual network/transport failures reject as a **`TypeError`** (matching standard fetch), with the underlying `BridgeRemoteError` attached as `.cause` so debug info survives.

**Cancellation.** `init.signal` is honored end-to-end. If the signal is already aborted, reject immediately without dispatching. If it aborts in-flight, the WebView sends a `bridge.cancel` (RFC-0001) for the request's `operationId` and rejects the promise; the UXP host aborts its in-flight native fetch via the `AbortSignal` from the dispatch context.

**Transport.** Request and response bodies reuse the existing fs binary-transport helpers (small bodies inlined as a number array, large bodies base64-encoded). No hard size cap in v1; very large bodies are documented as slow through `postMessage`.

**Security posture.** No capability gate and no outbound URL allow-list — zero-config, assuming trusted first-party WebView content. (This is a deliberate, recorded choice from the design session.)

**Known limitation.** Because the response is rebuilt via the `Response` constructor, `response.url` is empty and `response.redirected` is `false` regardless of any redirects the host followed. Documented, not worked around in v1.

## Scope

**In scope**
- Shared fetch protocol: module id, method name(s), request/response transport shapes (reusing fs binary helpers).
- WebView `fetch()`: request normalization (incl. FormData/Blob/URLSearchParams via DOM), dispatch, `Response` reconstruction, `TypeError`+`.cause` errors, `signal`→`bridge.cancel` wiring.
- UXP host adapter: run native fetch, wire the dispatch-context `AbortSignal`, read full body, return status/statusText/header-tuples/body.
- Registration on both sides and the WebView public export.

**Out of scope**
- Opt-in `window.fetch` global override — RFC-0003.
- Cookie / `Set-Cookie` handling and cookie-based sessions.
- Streaming request or response bodies; `Response.body` ReadableStream.
- Capability gating and outbound URL filtering.
- The `bridge.cancel` primitive itself — RFC-0001.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| New module id | A `FETCH_MODULE_ID` and method name(s) in a new shared fetch protocol file. |
| WebView export | `fetch(input, init)` named export from `uxp-webview-bridge/webview`. |
| Request transport | `{ url, method, headers: [name,value][], body: <fs-binary-transport or text>, redirect }`. |
| Response transport | `{ status, statusText, headers: [name,value][], body: <fs-binary-transport> }`. |
| Adapter | New `fetchModuleAdapter` registered by `configUxpBridge`, with no `capability`. |
| Errors | Network/transport failures surface as `TypeError` with `.cause` set to the originating `BridgeRemoteError`; HTTP error statuses resolve normally. |

## Implementation plan

1. Add the shared fetch protocol: `FETCH_MODULE_ID`, method name(s), and request/response transport types reusing the fs binary-transport helpers.
2. WebView request serialization: normalize `input` (`string | URL | Request`) and `init.body` (text/bytes/URLSearchParams/Blob/FormData via the DOM), collect forwarded init fields, reject `ReadableStream`.
3. WebView dispatch + response: call the RPC client, reconstruct `new Response(...)` from the returned transport, map errors to `TypeError` with `.cause`.
4. Wire `init.signal`: reject-immediately if pre-aborted; on in-flight abort, call the RPC client `cancel(operationId)` (RFC-0001) and reject.
5. UXP host adapter: perform native fetch using the dispatch-context `AbortSignal`, eagerly read the body to bytes, return status/statusText/header-tuples/body.
6. Register the adapter in `configUxpBridge` (no capability) and export `fetch` from the WebView public API.

## Testing

- WebView seam: given a stubbed RPC client returning a canned response transport, `fetch()` resolves a real `Response` whose `.status`/`.ok`/`.headers`/`.json()`/`.arrayBuffer()` reflect the transport; duplicate headers survive as multiple tuples.
- Body normalization: `string`, `Uint8Array`/`ArrayBuffer`, `URLSearchParams`, `Blob`, and `FormData` each produce the expected transport bytes and generated `Content-Type` (multipart boundary present for `FormData`); `ReadableStream` rejects.
- Error mapping: an HTTP 500 resolves with `ok:false`; a simulated transport failure rejects with a `TypeError` whose `.cause` is the `BridgeRemoteError`.
- Abort: a pre-aborted signal rejects without dispatch; an in-flight abort triggers a `bridge.cancel` for the operation and rejects the promise.
- UXP host seam: the adapter aborts its native fetch when the dispatch-context signal aborts, and returns full-body bytes for a normal response.

## Dependencies

RFC-0001 (`bridge.cancel` primitive) must land first — required for end-to-end abort.

## Open questions

None.
