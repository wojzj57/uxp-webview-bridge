# RFC-0008: Registry foundation refactor (batch 0.5)

Status: ready-for-agent
Source: notes/photoshop-full-coverage-roadmap.md (§2, §5 batch 0.5), ADR docs/adr/0009 (declarative type/value/collection registries)
Related: RFC-0005 (photoshop webview module), RFC-0006 (photoshop uxp host adapter), RFC-0004 (shared protocol & constants), RFC-0007 (tests), ADR docs/adr/0002 (remote-class-descriptor-table), docs/adr/0005 (identity-dedup-and-object-classification), docs/adr/0009

## Summary

Turn the three per-class, hand-wired decoding mechanisms of the initial photoshop batch into three reusable, declarative registries, so that adding any of the remaining ~37 ps-reference DOM classes is a registration plus a field list rather than edits across `context.ts`, both class factories, and the host. Introduce: (1) a **value-object registry** in shared code keyed by `valueKind`; (2) a **snapshot-collection factory** keyed by `memberKind`, generalizing the current `Layers` wrapper; (3) a **type registry** of `RemoteClass` subclasses keyed by remote type name, from which both WebView envelope→instance decoding and the host reference-property maps derive. Descriptor result-typing switches from injected `decode` closures to declarative names (`refType` / `valueKind` / `collectionOf`), resolved lazily at decode time (this is what breaks the cyclic-reference and construction-order problems). The existing Document / Layer / Layers / ImagingBounds are migrated onto the new mechanism with **no change to their public WebView API or wire protocol**. This is a pure internal refactor: batch 1 (Channels) is the first consumer and is out of scope here.

## Context & Problem

Today the WebView namespace (`photoshop.ts`) constructs one decoder closure per remote type (`documentDecoder`, `layerDecoder`, `layersDecoder`, `boundsDecoder`), collects them in `PhotoshopContext`, threads that context into each class factory, and attaches them per descriptor as `decode: someDecoder` (see `context.ts`, `document.ts`, `layer.ts`). `context.ts` already documents that the wiring is "late-bound … to avoid the initialization-order problem of the Document↔Layer cycle" — i.e. the O(N²)/cycle problem ADR 0009 describes is already visible at N=3. The host (`host.ts`) mirrors this with hand-maintained sets/maps (`LAYER_REF_PROPS`, `DOCUMENT_COLLECTION_PROPS`, `serializeImagingBounds`, `serializeLayersSnapshot`, `LAYERS_SNAPSHOT_KIND`). At full coverage the reference graph is dense and cyclic (`TextItem.color → SolidColor`, `Channel.document → Document`, `PathItem.subPathItems → SubPathItems`, …); the closure-injection model does not scale and deadlocks on factory order. ADR 0009 mandates the declarative-registry replacement; this RFC implements it and migrates the three existing classes.

## Design

### 1. Value-object registry (shared)

`src/shared/photoshop-api/value-objects.ts` defines a registry of value types. Each entry declares a `valueKind` and either a field list (copy-these-fields) or a custom `{ serialize, deserialize }` pair:

```ts
export interface ValueObjectSpec<T> {
  readonly valueKind: string;                 // "ImagingBounds", "SolidColor", ...
  readonly fields?: readonly string[];        // plain field-copy shape
  readonly serialize?: (host: unknown) => unknown;    // host side, optional
  readonly deserialize?: (transport: unknown) => T;   // webview side, optional
}
```

- The transport envelope is `{ kind: "uxp.photoshop.value", valueKind, data }` (a single stable kind, discriminated by `valueKind`), replacing per-type ad-hoc shapes.
- Host side: `serializeValue(valueKind, hostObject)` looks up the spec, applies `fields`/`serialize`, emits the envelope. Unwrapping `UnitValue`-like `{ _value }` (currently in `readMaybeUnit`) becomes a shared helper reused by field-copy specs.
- WebView side: `decodeValue(envelope)` looks up the spec by `valueKind` and applies `fields`/`deserialize` to a plain object.
- `ImagingBounds` is registered as the first entry (`fields: IMAGING_BOUNDS_FIELDS`); `bounds.ts` and `serializeImagingBounds` are deleted in favor of the registry.

### 2. Snapshot-collection factory (webview + host)

Generalize the current `Layers` wrapper (ADR 0005 collection kind) into a factory parameterized by member kind.

- Transport envelope becomes `{ kind: "uxp.photoshop.snapshot", memberKind, owner, memberIds[] }` (generalizing `LAYERS_SNAPSHOT_KIND` / `layerIds`). `memberKind` is a remote type name (`"Layer"`, `"Channel"`, …).
- WebView: `createSnapshotCollection({ memberKind, capabilities })` returns an Array-subclass factory. `[index]`/iteration/`length` lazily resolve `memberIds` → RemoteObject via the type registry (§3) and the identity cache. Optional capabilities: `getByName(name)` (one host RPC), `getByIndex(i)`, `add(options)` (mutating host RPC). Which capabilities exist is declared per collection, not assumed.
- Host: one `serializeSnapshot(memberKind, ownerRef, collection)` replacing `serializeLayersSnapshot`; `getLayersArray`'s array-like coercion becomes the generic member-array coercion.
- `Layers` is redefined as `createSnapshotCollection({ memberKind: "Layer", capabilities: { getByName, add } })`; its public shape (`getByName`, `add`, element `===`, container `!==`) is unchanged.

### 3. Type registry (webview + host) and declarative descriptors

`src/webview/photoshop-api/modules/photoshop/registry.ts` (WebView) holds `remoteTypeName → { factory, identityCache }`. Each `RemoteClass` subclass registers itself. Decoding an envelope resolves the factory by `type` and goes through that type's WeakRef cache (`getOrCreate`), so identity (`===`) is preserved — same behavior as today, centralized.

Descriptor result-typing switches from `decode: closure` to declarative names on `RemotePropertyDescriptor` / `RemoteMethodDescriptor`:

```ts
// remote-class.ts descriptor additions (result typing)
refType?: string;       // RemoteObject: resolve via type registry (nullable if the reply is null)
valueKind?: string;     // Value object: resolve via value-object registry
collectionOf?: string;  // Collection: build a snapshot collection of this member kind
```

- The RemoteClass base's `#decodeProperty` / method decode path changes from "call the injected `decode` closure" to "if `refType`/`valueKind`/`collectionOf` is set, resolve via the injected registry resolver." The base gains one injected `RemoteDecodeContext` (the resolver), replacing the four ad-hoc closures. `decode?: RemoteValueDecoder` may remain as a low-level escape hatch for non-photoshop modules (xmp), so this stays a superset — **xmp is untouched**.
- Host reference maps (`LAYER_REF_PROPS`, `DOCUMENT_COLLECTION_PROPS`, `DOCUMENT_LAYER_REF_PROPS`) are derived from the same declarative descriptors shared via the protocol, rather than hand-maintained in `host.ts`. The mechanism for sharing the per-property kind (scalar / value / ref / collection) between webview declarations and host dispatch is defined in the shared protocol module.

### 4. Migration of the existing three classes

`document.ts`, `layer.ts`, `layers.ts`, `photoshop.ts`, `context.ts`, and the host serializers are rewritten to the declarative form. `context.ts`'s four decoder fields collapse into the registry resolver. No public API, namespace shape, or wire-method name changes; only the internal decoding path and host serialization change.

## Scope

**In scope**
- `src/shared/photoshop-api/value-objects.ts` (value-object registry + envelope + `serializeValue`/`decodeValue` + shared `UnitValue` unwrap helper).
- Snapshot-collection factory: WebView `createSnapshotCollection` (replacing/absorbing `layers.ts`), host `serializeSnapshot` (replacing `serializeLayersSnapshot`), generalized snapshot envelope in the protocol.
- WebView type registry `registry.ts`; RemoteClass subclass self-registration.
- `remote-class.ts`: add `refType`/`valueKind`/`collectionOf` to descriptors; add an injected decode-resolver; route decoding through it. Keep `decode` closure as a superset escape hatch (xmp unaffected).
- Shared protocol: generalized snapshot/value envelopes; a shared per-property kind table so host dispatch derives reference/collection/value handling from declarations instead of hand-maintained sets.
- Migrate Document / Layer / Layers / ImagingBounds onto the registries; delete `bounds.ts`, `serializeImagingBounds`, `LAYERS_SNAPSHOT_KIND`, and the hand-maintained host property sets they replace.
- Static tests (§Testing) for registry completeness and no-dangling-type-name.

**Out of scope**
- Any new DOM class (Channels/Channel is batch 1, RFC to follow) — this RFC adds zero new classes.
- batchPlay (RFC-0009) and imaging/binary transport (RFC-0010).
- The generic `RemoteClass` write-queue / batch semantics (ADR 0003) — unchanged.
- xmp and other non-photoshop modules — the `decode` closure escape hatch keeps them untouched.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| Value envelope | `{ kind: "uxp.photoshop.value", valueKind, data }` (replaces per-type shapes) |
| Snapshot envelope | `{ kind: "uxp.photoshop.snapshot", memberKind, owner, memberIds[] }` (generalizes layers snapshot) |
| Descriptor typing | `refType` / `valueKind` / `collectionOf` declarative names; `decode` closure retained as escape hatch |
| Public WebView API | **No change** — `photoshop`, `PsDocument`, `PsLayer`, `Layers`, `ImagingBounds` behave identically |
| Wire method names | **No change** — all existing `document.*` / `layer.*` / `layers.*` method names preserved |

## Implementation plan

1. Shared: add `value-objects.ts` (registry, envelope, `serializeValue`/`decodeValue`, `UnitValue` unwrap). Register `ImagingBounds`.
2. Shared: generalize the snapshot envelope + add the per-property kind table to `photoshop-protocol.ts`.
3. WebView: add `registry.ts` (type registry + identity caches migrated out of `photoshop.ts`).
4. `remote-class.ts`: add `refType`/`valueKind`/`collectionOf` + injected decode-resolver; route `#decodeProperty` and method decode through it; keep `decode` closure path.
5. WebView: `createSnapshotCollection`; redefine `Layers` on it; delete the bespoke `layers.ts` internals.
6. Migrate `document.ts` / `layer.ts` to declarative descriptors; register both in the type registry; delete `bounds.ts`.
7. Rewrite `photoshop.ts` / `context.ts` to build the registry resolver instead of the four closures.
8. Host: add `serializeValue`/`serializeSnapshot`; derive reference/collection/value dispatch from the shared kind table; delete `serializeImagingBounds`, `serializeLayersSnapshot`, `LAYER_REF_PROPS`, `DOCUMENT_COLLECTION_PROPS`, `DOCUMENT_LAYER_REF_PROPS`.
9. `pnpm typecheck` + `pnpm test:static`; then `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp` to confirm the existing photoshop CDP cases (from RFC-0007) still pass unchanged — the refactor's success criterion is a green existing suite with no case edits.

## Testing

- **Static (no Photoshop):** every `refType`/`valueKind`/`collectionOf` referenced by any descriptor resolves to a registered entry (no dangling names); every `RemoteClass` subclass is registered under a unique type name; the value-object registry's `valueKind`s are unique; ADR 0002's descriptor-keys === `declare`-keys test still holds for the migrated classes.
- **WebView unit seam (stubbed rpc):** a `refType` property decodes an envelope to a `===`-cached instance; a `valueKind` property decodes to a plain object with the registered fields; a `collectionOf` property builds a snapshot collection whose `[index]` resolves to `===` members and throws `BridgeRemoteError` on a missing id.
- **Regression via existing CDP suite:** the RFC-0007 photoshop cases (`photoshop.document-read`, `photoshop.layer-read-write`, `photoshop.layer-bounds-value`, `photoshop.layers-collection`, `photoshop.identity-dedup`) pass without modification, proving behavioral equivalence.

## Dependencies

None external. Must land as one unit (webview + host + shared) because `test/static/check-boundaries.mjs` enforces module-tree symmetry and the envelope shapes are shared. No other RFC blocks this; RFC-0009 (batchPlay) and RFC-0010 (imaging) are independent and may proceed in parallel.

## Resolved decisions

- **RemoteClass `decode` closure is retained as an escape hatch** (not removed). Photoshop descriptors use the declarative `refType`/`valueKind`/`collectionOf`; the closure path stays for non-photoshop modules (xmp), so this refactor does not touch xmp and keeps blast radius minimal.
- **The host-side per-property "kind table" is a standalone shared data table** in `photoshop-protocol.ts`, keyed by `{class, property} → kind` (scalar / value / ref / collection). `src/uxp` must not import `src/webview` descriptors (AGENTS.md), so the host derives dispatch from this table rather than the WebView descriptor objects; a static test asserts the table stays in sync with the WebView descriptors.
