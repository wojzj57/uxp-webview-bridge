# RFC-0005: Photoshop WebView remote module

Status: ready-for-agent
Source: notes/photoshop-module-spec.md (§1–§5, §7), approved plan "Photoshop 模块开发计划（核心对象全量）"
Related: RFC-0004 (shared protocol & constants), RFC-0006 (UXP host adapter), RFC-0007 (tests), ADR docs/adr/0002 (remote-class-descriptor-table), docs/adr/0003 (property-write-and-batch-semantics), docs/adr/0005 (identity-dedup-and-object-classification), docs/adr/0008 (remote-class-location), CONTEXT.md

## Summary

Deliver the WebView-side `photoshop` namespace: `PsDocument` and `PsLayer` remote proxies (RemoteClass subclasses with descriptor tables + `declare` members), the `Layers` collection (a WebView-local Array subclass over an id snapshot with lazy per-element resolution), the `ImagingBounds` value-object decoder, and the `photoshop.app` namespace entry (`activeDocument`, `documents`, `open`). It wires cross-object reference encode/decode and WeakRef identity caches so the same remote object resolves to `===` instances, and exports the transcribed constants (`photoshop.LayerKind`, etc.). All real work executes on the UXP host (RFC-0006); this side is proxies only.

## Context & Problem

`src/webview` is WebView runtime code that must never import `src/uxp` (`AGENTS.md`); every real Photoshop call executes host-side and returns over the bridge. WebView users need ergonomic proxies for the core DOM objects — a `Document`, its `Layer`s, layer collections, and layer bounds — that behave like the objects they proxy while honoring the bridge's async property model (ADR 0003) and identity guarantees (ADR 0005). This RFC builds those proxies on top of the already-in-place generic infrastructure in `src/webview/uxp-api/remote/` (RemoteClass, identity-cache, reference codec) and the shared contract from RFC-0004, using the existing xmp module as the implementation template.

## Design

**Namespace surface.** `createPhotoshopNamespace(rpc)` returns `{ app, LayerKind, BlendMode, AnchorPosition, ElementPlacement, SaveOptions, FlipAxis }`, exported as a singleton `photoshop` from `uxp-webview-bridge/webview`. `app` exposes `activeDocument` (→ `Promise<PsDocument>`), `documents` (→ `Promise<Layers-like Document list>` per plan; a document collection), and `open(...)` (→ `Promise<PsDocument>`). The namespace owns the Document and Layer WeakRef identity caches and the cross-object reference codec (envelope ↔ instance).

**RemoteClass subclasses (descriptor table + declare).** `WebviewPsDocument` and `WebviewPsLayer` each supply a static `properties` table and `methods` table (`as const`) plus `declare` typed members — the descriptor table is the runtime source of truth, the `declare` members are the compile-time surface, and RFC-0007's static test locks `keyof properties ∪ keyof methods === declare key set`. Getters return `Promise<T>`; setters are fire-and-forget RPC queued on the per-instance write queue (read-your-writes: a read/method-call first awaits the pending write chain). Each property/method descriptor carries `writable` and `mutating` flags; the `mutating` flag is *consumed host-side* (RFC-0006) — the WebView is unaware of `executeAsModal`.

The closed-loop membership for this batch:

- **PsDocument** — read-only scalars (`id`, `saved`, `name`, `title`, `path`, `width`, `height`, `resolution`, `cloudDocument`, `cloudWorkAreaDirectory`), one rw scalar (`pixelAspectRatio`); collection properties (`layers`, `activeLayers`, `artboards`) → `Layers`; reference property (`backgroundLayer`) → `PsLayer | null`; non-mutating method `duplicate`; mutating (executeAsModal) methods `close`, `closeWithoutSaving`, `flatten`, `mergeVisibleLayers`, `revealAll`, `rasterizeAllLayers`, `crop`, `resizeCanvas`, `resizeImage`, `trim`, `rotate`, `createLayer`, `createPixelLayer`, `createTextLayer`, `createLayerGroup`, `groupLayers`, `duplicateLayers`, `linkLayers`, `paste`, `save`.
- **PsLayer** — read-only scalars (`id`, `locked`, `isBackgroundLayer`, `kind`); rw scalars (`name`, `opacity`, `fillOpacity`, `visible`, `blendMode`, `allLocked`, `pixelsLocked`, `positionLocked`, `transparentPixelsLocked`, `isClippingMask`, `filterMaskDensity`, `filterMaskFeather`, `layerMaskDensity`, `layerMaskFeather`, `vectorMaskDensity`, `vectorMaskFeather`, `selected`); value-object props (`bounds`, `boundsNoEffects`) → `ImagingBounds`; reference props (`document` → Document, `parent` → `PsLayer | null`, `linkedLayers` → `Layers`); mutating methods `delete`, `duplicate`, `link`, `unlink`, `move`, `translate`, `flip`, `scale`, `rotate`, `merge`, `rasterize`.

**Dangling references are excluded.** Any property or method whose type references a class outside this batch (Selection, Channels, HistoryState, SolidColor, PathItems, LayerComps, Guides, TextItem, and the `apply*` filter methods, `saveAs` needing a UXP File token, etc.) is deliberately not implemented this batch. This keeps the four-class subset closed.

**Value object: ImagingBounds.** `bounds`/`boundsNoEffects` decode via a `bounds.ts` decoder that turns the shared `ImagingBoundsTransport` (RFC-0004's six-field shape) into a plain WebView object — no handle, no methods, not registered. The decoder uses `IMAGING_BOUNDS_FIELDS` so it never drifts from the host serializer.

**Collection: Layers.** `createLayersCollection` produces a WebView-local Array subclass (ADR 0005 collection wrapper) holding a snapshot `{ ownerRef, layerIds[] }` obtained via one `layers.snapshot` RPC. `[index]`, iteration, and `length` lazily resolve ids → `PsLayer` through the Layer identity cache (so resolved elements are `===`, but two collection instances are not `===`). The snapshot is *not* auto-refreshed; accessing an id that no longer exists throws `BridgeRemoteError` (user must re-`await doc.layers`). `getByName(name)` performs one `layers.getByName` host RPC returning the matching layer reference (local name-compare is not viable without pulling every member's name). `add(...)` is a mutating host call (equivalent to `createLayer`).

**Identity & references.** The namespace holds `referenceId → RemoteObject` WeakRef + `FinalizationRegistry` caches for Document and Layer. When encoding arguments, RemoteObjects become reference envelopes; when decoding return values, envelopes become the correct subclass instance (Document/Layer) via the cache (`getOrCreate`), guaranteeing `===` for the same remote id without leaking.

**Errors.** Remote failures surface as `BridgeRemoteError` carrying the host error metadata (name/message/stack/code) and `operationId`, per the bridge's existing remote-error contract.

## Scope

**In scope**
- `src/webview/uxp-api/modules/photoshop/`: `types.ts`, `bounds.ts`, `layers.ts`, `document.ts`, `layer.ts`, `photoshop.ts` (namespace + identity caches + reference codec + singleton), `index.ts` re-exports.
- Wiring the six transcribed constants (from RFC-0004) onto the namespace object.
- WebView public export: `export { photoshop } from "./uxp-api/modules/photoshop/index.js"` + type exports in `src/webview/index.ts`.
- `batchGet(propNames[])` / `batchSet(partialProps)` instance methods on PsDocument/PsLayer, delegating to the RemoteClass base's batch support; `batchSet` input typed as a partial over *writable* props only.

**Out of scope**
- The UXP host adapter, dispatch, registry, `executeAsModal` wrapping, and `ImagingBounds` *serializer* — RFC-0006. This side only *decodes* the shape.
- All tests (static consistency + co-located CDP cases) — RFC-0007.
- Any out-of-batch class (Selection/Channels/TextItem/…), `apply*` filters, `saveAs`.
- The generic `RemoteClass`/identity-cache/reference infrastructure — already in place under `src/webview/uxp-api/remote/`, reused as-is.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| WebView export | `photoshop` singleton named export from `uxp-webview-bridge/webview` |
| Namespace shape | `{ app: { activeDocument, documents, open }, LayerKind, BlendMode, AnchorPosition, ElementPlacement, SaveOptions, FlipAxis }` |
| New proxies | `PsDocument`, `PsLayer` (RemoteClass subclasses); getters `Promise<T>`, setters fire-and-forget queued |
| Collection | `Layers` Array subclass: `[index]`, `length`, iteration, `getByName`, `add`; element `===`, container `!==` |
| Value type | `ImagingBounds` plain object `{ left, right, top, bottom, width, height }`, no methods |
| Batch methods | `batchGet(propNames[])`, `batchSet(partialWritableProps)` per object |
| Reference codec | Document/Layer envelope ↔ instance via WeakRef identity caches |

## Implementation plan

1. `types.ts`: declare `PhotoshopNamespace`, `PsDocument`/`PsLayer`/`Layers` interfaces, `ImagingBounds`, and create-options types (aligning to `@shared-types/photoshop` where a type exists).
2. `bounds.ts`: `ImagingBounds` decoder from `ImagingBoundsTransport` using `IMAGING_BOUNDS_FIELDS`.
3. `document.ts`: `WebviewPsDocument extends RemoteClass` — descriptor `properties`/`methods` tables + `declare` members for the PsDocument membership above.
4. `layer.ts`: `WebviewPsLayer extends RemoteClass` — descriptor tables + `declare` members for the PsLayer membership above.
5. `layers.ts`: `createLayersCollection` — Array subclass over `{ ownerRef, layerIds[] }` snapshot, lazy id→PsLayer resolution via the Layer identity cache, `getByName` RPC, mutating `add`.
6. `photoshop.ts`: `createPhotoshopNamespace(rpc)` — build Document/Layer WeakRef identity caches, the envelope↔instance codec, `app.activeDocument`/`documents`/`open`, attach constants; export the `photoshop` singleton.
7. `index.ts`: re-export; update `src/webview/index.ts` to export `photoshop` and its public types.
8. `pnpm typecheck` + `pnpm test:static` (symmetry with RFC-0006's uxp directory is required by the boundary checker — coordinate landing order).

## Testing

Behavioral verification is owned by RFC-0007, but this RFC is designed to be testable at these seams:
- **WebView unit seam (no Photoshop):** with a stubbed `rpc`, reading a proxied property issues the expected `*.propertyGet` call and decodes the reply; a setter enqueues a `*.propertySet` and a subsequent read awaits it (read-your-writes); `Layers` resolves `[index]` to `===` `PsLayer` instances and throws `BridgeRemoteError` on a missing id.
- **Static consistency (no Photoshop):** each RemoteClass's `keyof properties ∪ keyof methods` equals its `declare` member key set; `batchSet` rejects a read-only property at compile time (`// @ts-expect-error`).
- **Co-located CDP (real Photoshop, `test:uxp`):** `photoshop.public-shape`, `photoshop.document-read`, `photoshop.layer-read-write`, `photoshop.layer-bounds-value`, `photoshop.layers-collection`, `photoshop.identity-dedup` — all defined in RFC-0007.

## Dependencies

RFC-0004 (shared protocol & constants) must land first. Directory symmetry with RFC-0006's `src/uxp/uxp-api/modules/photoshop/` is enforced by `test/static/check-boundaries.mjs`, so RFC-0005 and RFC-0006 must land together (or the static check will fail on an asymmetric module tree).

## Open questions

None.
