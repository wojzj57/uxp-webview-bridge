# Agent Guide

This package is a bridge library between Adobe UXP plugin hosts and WebView clients; keep `src` limited to bridge protocol/types, WebView remote namespaces, UXP host adapters, and message serialization/dispatch/validation.

## Read First

- CONTRIBUTING rules: `CONTRIBUTING.md`
- Testing rules: `test/TESTING.md`
- Project context: `CONTEXT.md`

## Core Boundaries

- `src/webview` is WebView runtime code only and must never import from `src/uxp`.
- `src/uxp` is Adobe UXP host runtime code only and must never import from `src/webview`.
- `src/shared` is runtime-neutral protocol, errors, transport shapes, capabilities, and utilities only.
- Shared code must not contain concrete `os`, `uxp`, `photoshop`, or `fs` implementations.
- WebView exports are remote proxies; all real UXP, Photoshop, OS, and filesystem calls execute on the UXP side.
- UXP host code owns origin validation, capability checks, request dispatch, and resource handle lifecycle.

## Public API

- WebView exports direct namespaces from `uxp-webview-bridge/webview`, such as `fs`, `os`, and `path`.
- WebView has one setup function: `configWebviewBridge`.
- UXP has one setup function: `configUxpBridge`.
- Do not reintroduce deprecated factory/setup APIs such as `createPhotoshopClient`, `createBridgeClient`, `createPhotoshopHost`, `createBridgeHost`, or `configureBridgeClient`.

## Layout And Imports

- WebView and UXP bridged module directories must stay symmetric under `src/webview/.../modules/{moduleName}` and `src/uxp/.../modules/{moduleName}`.
- One module directory owns one module only; do not merge unrelated modules into catch-all adapter or runtime folders.
- Imports in `src` may use `./` and `../`; deeper relative imports such as `../../` are forbidden and must use the `tsconfig.json` path aliases.

## Bridge Semantics

- WebView property writes that cross the bridge must be queued and flushed before later reads or method calls; do not rely on async setters.
- WebView remote errors must surface as `BridgeRemoteError` with remote error metadata such as name/message/stack/code and `operationId`.
- Remote object identity is represented by stable remote ids; persistent references such as documents/layers should not require user disposal, while resource handles must expose explicit cleanup and host-side timeout cleanup.
- Binary data must use transport-safe envelopes; do not depend on `postMessage` transfer semantics.
- Mutating Photoshop operations must respect modal execution semantics; reads should not enter modal execution unnecessarily.

## Verification

- Every `src` change must pass `pnpm typecheck`.
- Run `pnpm test:static` for boundary, layout, and import-rule checks.
- Run `pnpm build` before publishing or handing off a completed implementation.
