# Development Standards

## Scope

This package is a bridge library between Adobe UXP plugin hosts and WebView clients.

The package must not contain application shell code, product UI, or business workflow code. All code in `src` must serve one of these responsibilities:

- define runtime-neutral bridge protocol and shared types
- expose WebView-side remote namespaces
- execute real UXP-side host adapters
- serialize, dispatch, or validate bridge messages

Adobe UXP and Photoshop API shape must be derived from the local `uxp-document/` source tree when implementing bridged modules.

## Runtime Boundaries

`src` is split into three runtime boundaries:

- `src/webview`: WebView runtime code only
- `src/uxp`: Adobe UXP host runtime code only
- `src/shared`: runtime-neutral bridge protocol, errors, transport value shapes, capability types, and generic utilities only

`src/webview` must never import from `src/uxp`.

`src/uxp` must never import from `src/webview`.

Both runtime sides may import from `src/shared`.

Shared code must not contain concrete `os`, `uxp`, `photoshop`, or `fs` module implementation. If a module exists on both sides, each side owns its own implementation under a symmetric directory.

## Public API

The WebView subpath exports ready-to-use remote namespaces directly:

```ts
import { os, photoshop, uxp } from "uxp-webview-bridge/webview";
```

The WebView subpath has exactly one bridge configuration function:

```ts
import { configWebviewBridge } from "uxp-webview-bridge/webview";
```

The UXP subpath has exactly one bridge configuration function:

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";
```

Do not add alternate setup functions for the same responsibility. Deprecated factory-style APIs such as `createPhotoshopClient`, `createBridgeClient`, `createPhotoshopHost`, `createBridgeHost`, and `configureBridgeClient` must not be reintroduced.

## Directory Layout

WebView and UXP module directories must be symmetric.

UXP API modules use this layout:

```txt
src/webview/uxp-api/modules/{moduleName}/
src/uxp/uxp-api/modules/{moduleName}/
```

The `os` module, for example, must live at:

```txt
src/webview/uxp-api/modules/os/
src/uxp/uxp-api/modules/os/
```

Photoshop API modules use this layout:

```txt
src/webview/photoshop-api/modules/{moduleName}/
src/uxp/photoshop-api/modules/{moduleName}/
```

One directory contains one module only. Do not merge unrelated modules into catch-all adapter folders, runtime folders, or multi-module implementation indexes.

Index files may re-export a single module's local public surface. They must not implement unrelated modules.

## Module Ownership

WebView module directories own:

- remote proxy objects
- WebView-facing namespace exports
- WebView-facing module types
- calls into the WebView bridge runtime

UXP module directories own:

- host adapters
- real UXP or Photoshop calls
- capability enforcement
- result serialization for the matching module

`src/shared` owns:

- protocol envelopes
- operation IDs
- bridge errors
- transport-safe value shapes
- capability types
- runtime-neutral utilities

## Bridge Semantics

WebView-side exports are remote proxies, not native UXP or Photoshop objects.

All real UXP, Photoshop, OS, and filesystem calls execute on the UXP side.

WebView code must not call `require("photoshop")`, `require("uxp")`, `require("os")`, or `require("fs")`.

UXP host code is responsible for origin validation, capability checks, request dispatch, and resource handle lifecycle management.

## Verification

Every change to `src` must satisfy these checks:

- `src/webview` has no imports from `src/uxp`
- `src/uxp` has no imports from `src/webview`
- `src/webview/index.ts` exports `configWebviewBridge` and direct namespaces such as `uxp`, `photoshop`, and `os`
- `src/uxp/index.ts` exports `configUxpBridge` as the only public setup method
- every bridged module has matching WebView and UXP module directories
- no module directory contains implementation for more than one module
- `pnpm typecheck` passes

Run `pnpm build` before publishing or handing off a completed implementation.
