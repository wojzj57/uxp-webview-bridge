# RFC-0003: Opt-in `window.fetch` global installer

Status: ready-for-agent
Source: Grilling/domain-modeling session on forwarded WebView fetch (2026-07-06)
Related: RFC-0002 (forwarded fetch module)

## Summary

Provide an opt-in installer that replaces the WebView's global `window.fetch` with the forwarded fetch from RFC-0002, so third-party or otherwise uncontrolled code that calls the bare `fetch(...)` also routes through the UXP host and bypasses CORS. The global is only ever overridden when the plugin author explicitly calls the installer; it is never touched automatically.

## Context & Problem

RFC-0002 exposes a named `fetch` export, which requires callers to import it. Bundled libraries and code you don't own call the bare global `fetch` and cannot be rewritten to use the named export. For those cases, an explicit opt-in that swaps `window.fetch` lets existing code benefit from forwarded fetch without modification, while keeping the default behavior unsurprising (no implicit global mutation).

## Design

Expose an installer (e.g. `installFetch()`) from `uxp-webview-bridge/webview` that:

- Overrides `globalThis.fetch` / `window.fetch` with the forwarded `fetch` from RFC-0002.
- Returns an uninstaller that restores the previously captured `fetch`, so the override is reversible.
- Is idempotent / safe to call once at startup; repeated installs restore-then-reinstall rather than stacking captures of the already-overridden function.

The installer performs no network logic of its own — it is a thin binding over RFC-0002's `fetch`. All request/response/error/abort semantics are exactly those defined in RFC-0002.

## Scope

**In scope**
- An opt-in installer exported from the WebView public API that overrides `window.fetch`.
- A reversible uninstaller that restores the original global.

**Out of scope**
- All fetch behavior (serialization, `Response` reconstruction, errors, abort, transport) — owned by RFC-0002.
- Automatic/implicit installation during `configWebviewBridge` — installation is always explicit.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| WebView export | New installer, e.g. `installFetch(): () => void` — installs the forwarded fetch onto the global and returns an uninstaller. |
| Global mutation | `globalThis.fetch` is reassigned only when the installer is called; the original is captured for restoration. |

## Implementation plan

1. Capture the current `globalThis.fetch` and assign the RFC-0002 forwarded `fetch` in its place.
2. Return an uninstaller that restores the captured original; guard against double-install stacking.
3. Export the installer from the WebView public API.

## Testing

- After `installFetch()`, calling the bare global `fetch(...)` routes through the forwarded fetch (observable via the same stubbed RPC seam used in RFC-0002).
- The returned uninstaller restores the original global `fetch` reference.
- Calling `installFetch()` twice does not lose the ability to restore the true original.

## Dependencies

RFC-0002 (forwarded fetch module) must land first.
