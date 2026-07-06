# Project Context

This repository implements `uxp-webview-bridge`, a library that connects Adobe UXP plugin hosts with WebView clients. It is not an application shell and should not contain product UI or business workflow code.

The package exposes remote WebView-side namespaces and UXP-side host adapters. WebView code talks through bridge proxies; real UXP, Photoshop, OS, and host-only work happens on the UXP side.

Long-lived contribution rules live in `AGENTS.md` and `CONTRIBUTING.md`. Testing rules live in `test/TESTING.md`.

## Language

**Forwarded fetch**:
A WebView `fetch` call whose actual network request is executed on the UXP host instead of the WebView, so it bypasses browser CORS restrictions. The WebView serializes the request, the UXP host performs it and returns the full response, and the WebView reconstructs a native `Response`.
_Avoid_: proxy fetch, CORS bypass

**Cancel envelope**:
A fire-and-forget bridge message (`bridge.cancel`) sent from the WebView to the UXP host to abort an in-flight operation, keyed by its `operationId`. A first-class RPC primitive available to any module, not only fetch.
_Avoid_: abort message, cancel call
