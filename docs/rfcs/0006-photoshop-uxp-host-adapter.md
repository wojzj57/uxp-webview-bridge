# RFC-0006: Photoshop UXP host adapter and dispatch

Status: ready-for-agent
Source: notes/photoshop-module-spec.md (§2–§7), approved plan "Photoshop 模块开发计划（核心对象全量）"
Related: RFC-0004 (shared protocol & constants), RFC-0005 (WebView module), RFC-0007 (tests), ADR docs/adr/0003 (property-write-and-batch-semantics), docs/adr/0004 (shared-remote-reference-and-handle-registry), docs/adr/0005 (identity-dedup-and-object-classification), docs/adr/0007 (execute-as-modal-boundary), CONTEXT.md

## Summary

Deliver the UXP host side of the `photoshop` module: an adapter (`photoshopModuleAdapter`) registered with `configUxpBridge`, gated on the `photoshop` capability, holding its own `createRemoteHandleRegistry()` instance, and a `dispatchPhotoshopCall` that validates the method name, validates arguments, resolves references to real `photoshop` DOM objects, wraps mutating operations in `executeAsModal`, and serializes results back into transport shapes. It owns identity dedup (stable `Document:${id}` / `Layer:${id}` handle keys), the `ImagingBounds` value serializer, and single-modal-scope `batchSet`. This is where every real Photoshop, DOM, and modal call actually happens.

## Context & Problem

`src/uxp` is Adobe UXP host runtime code and must never import `src/webview` (`AGENTS.md`); the UXP host owns origin validation, capability checks, request dispatch, and resource-handle lifecycle. WebView proxies (RFC-0005) send method names + encoded arguments; something host-side must turn those into real `require('photoshop')` DOM calls, respect Photoshop's modal-execution semantics for mutations (ADR 0007), keep a stable identity for each real DOM object so the WebView's `===` guarantee holds (ADR 0005), and serialize value objects and references back. This RFC is that host adapter, built with the existing generic `createRemoteHandleRegistry()` (`src/uxp/uxp-api/remote/handle-registry.ts`) and the shared contract from RFC-0004, using the xmp host as the implementation template.

## Design

**Adapter registration.** `photoshopModuleAdapter` implements `UxpModuleAdapter`: `moduleId = PHOTOSHOP_MODULE_ID` (RFC-0004), `capability = "photoshop"`, a `dispatch` entry point, and `destroy` that tears down its registry. It holds its **own** `createRemoteHandleRegistry()` instance — handle-id space is isolated per module (ADR 0004). It is added to the adapters array wired by `configUxpBridge` in `src/uxp/index.ts`.

**Dispatch pipeline (order matters).** `dispatchPhotoshopCall` runs, in this order:
1. **Validate method** — `assertPhotoshopProtocolMethodName(name)` (RFC-0004); unknown → error.
2. **Validate & decode args** — following the xmp `expectArgs`/`expectReferenceArgs`/`decodeArgs` pattern; reference-envelope arguments are resolved from the registry to the real DOM object (throwing `BridgeRemoteError` if the handle is gone).
3. **Execute** — non-mutating descriptors call the real `photoshop` API directly (reads must not enter modal execution unnecessarily); mutating descriptors wrap the call in `require('photoshop').core.executeAsModal(fn, { commandName })`.
4. **Serialize result** — scalars pass through; `ImagingBounds` goes through the explicit value serializer; DOM objects (Document/Layer) go through the registry to produce a stable reference envelope.

**Identity dedup.** On serializing a Document or Layer, the adapter computes a stable key — `Document:${nativeDoc.id}` / `Layer:${nativeLayer.id}` — and calls `registry.getOrCreate(key, factory)`. The same real object always maps to the same key → same reference id, which is what lets the WebView cache resolve two references to one `===` proxy (ADR 0005). The generic registry itself carries no Photoshop semantics; the key computation is the module's job.

**executeAsModal boundary.** The `mutating: true|false` descriptor flag (shared with the WebView tables, but *consumed only here*) decides whether a call is wrapped. `batchSet` with multiple mutating properties is wrapped in a **single** `executeAsModal` scope — one RPC is one modal scope. v1 does **no** host-side auto-serialization of concurrent mutating calls; a modal conflict surfaces as a `BridgeRemoteError` for the caller to serialize on their side.

**Value serialization: ImagingBounds.** An explicit serializer copies exactly the `IMAGING_BOUNDS_FIELDS` six fields (`left`, `right`, `top`, `bottom`, `width`, `height`) from the native bounds object into a plain `ImagingBoundsTransport` (RFC-0004). No handle is allocated; it is not registered. Sharing the field-list constant keeps host serializer and WebView decoder aligned.

**Batch dispatch.** `document.batchGet`/`layer.batchGet` accept `{ reference, propNames }` and return a keyed map read in one call; `document.batchSet`/`layer.batchSet` accept `{ reference, props }` and apply them in one call (mutating props under a single modal scope). These are the host halves of the batch method-name constants defined in RFC-0004.

**Handle lifecycle.** Persistent references (Document/Layer) live in the registry with TTL touch/prune; the registry's host-side timeout cleanup handles abandoned handles (WebView users do not manually dispose persistent DOM references). `destroy` clears the whole registry when the bridge tears down.

**Error semantics.** Any host-side failure (bad handle, Photoshop API throw, modal conflict) is converted to the bridge's remote-error envelope so the WebView surfaces it as `BridgeRemoteError` with `operationId` and the original error metadata.

## Scope

**In scope**
- `src/uxp/photoshop-api/modules/photoshop/`: `types.ts` (host module require shape, handle types, method-name types), `host.ts` (`photoshopModuleAdapter` + `dispatchPhotoshopCall` + `ImagingBounds` serializer + identity keys + batch + modal wrapping), `index.ts` re-export.
- Registering the adapter in `src/uxp/index.ts`'s adapters array.
- Consuming the existing generic `createRemoteHandleRegistry()` (one instance per adapter).

**Out of scope**
- WebView proxies, namespace, decoders, and public export — RFC-0005 (this side only produces/consumes the shared transport shapes).
- The generic handle-registry implementation itself — already in place at `src/uxp/uxp-api/remote/handle-registry.ts`, reused as-is.
- All tests — RFC-0007.
- Out-of-batch classes and methods (Selection/Channels/TextItem, `apply*` filters, `saveAs`), matching RFC-0005's closed subset.
- Host-side auto-serialization of concurrent mutating calls (deliberately deferred; conflicts surface as errors).

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| New adapter | `photoshopModuleAdapter` (`moduleId=PHOTOSHOP_MODULE_ID`, `capability="photoshop"`, own registry, `destroy`) |
| Registration | Added to the adapters array in `configUxpBridge` (`src/uxp/index.ts`) |
| Dispatch | `dispatchPhotoshopCall`: validate method → validate/decode args → (modal|direct) execute → serialize |
| Identity keys | `Document:${id}` / `Layer:${id}` via `registry.getOrCreate` |
| Modal wrapping | `mutating` descriptors → `core.executeAsModal(fn, { commandName })`; `batchSet` mutating props → one scope |
| Value serializer | `ImagingBounds` → six-field `ImagingBoundsTransport` (no handle) |
| Batch | `*.batchGet` `{ reference, propNames }` → keyed map; `*.batchSet` `{ reference, props }` |

## Implementation plan

1. `types.ts`: host `require('photoshop')` shape, handle types, and the method-name types imported from RFC-0004's protocol.
2. `host.ts` scaffold: `photoshopModuleAdapter` with `moduleId`/`capability`/own `createRemoteHandleRegistry()`/`destroy`, and a `dispatchPhotoshopCall` skeleton that runs `assertPhotoshopProtocolMethodName` first.
3. Argument validation/decoding: port the xmp `expectArgs`/`expectReferenceArgs`/`decodeArgs` helpers; resolve reference envelopes from the registry, throwing on a missing handle.
4. `app.*` handlers: `activeDocument`, `documents`, `open` — resolve/serialize Document references via `getOrCreate` keyed `Document:${id}`.
5. `document.*` and `layer.*` handlers: per-property get/set and each method; wrap `mutating` calls in `executeAsModal`; serialize Document/Layer returns as references, `ImagingBounds` via the value serializer, `Layers` snapshots as id arrays.
6. `layers.*` handlers: `snapshot` (owner ref → member id array), `getByName` (return matching layer reference), `add` (mutating create).
7. Batch handlers: `batchGet` (read many, one call), `batchSet` (apply many; mutating props in a single modal scope).
8. Register `photoshopModuleAdapter` in `src/uxp/index.ts`; run `pnpm typecheck` + `pnpm test:static` (module directory must be symmetric with RFC-0005's webview tree).

## Testing

Behavioral verification is owned by RFC-0007; this RFC is designed to be testable at these seams:
- **UXP host seam (real Photoshop, `test:uxp`):** dispatching `document.propertyGet` for `name`/`id`/`width`/`height` returns correct scalars; a mutating `layer.propertySet` for `opacity` is applied (verified by a subsequent read); `createLayer`/`duplicate`/`delete` round-trip; two dispatches resolving the same real layer produce the same reference id (feeding the WebView's `identity-dedup` case).
- **Value serialization:** `layer.propertyGet` for `bounds` returns a plain six-field object with no handle allocated.
- **Modal boundary:** a mutating call is wrapped in `executeAsModal` (observable via command name / the fact that a read of the same property is not wrapped); a `batchSet` of multiple mutating props runs in a single modal scope.
- **Error mapping:** dispatching against a disposed/unknown handle surfaces a `BridgeRemoteError`.

## Dependencies

RFC-0004 (shared protocol & constants) must land first. Directory symmetry with RFC-0005's `src/webview/photoshop-api/modules/photoshop/` is enforced by `test/static/check-boundaries.mjs`, so RFC-0006 and RFC-0005 must land together.

## Open questions

None.
