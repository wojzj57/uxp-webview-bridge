# RFC-0011: Channels/Channel + SolidColor (batch 1 — foundation validation)

Status: ready-for-agent
Source: notes/photoshop-full-coverage-roadmap.md (§5 batch 1 + §8 next-step plan; SolidColor pulled forward from batch 3 per grilling decision 2026-07-08)
Related: RFC-0008 (registry foundation refactor — the mechanism this RFC is the first external consumer of), RFC-0005 (photoshop webview module), RFC-0006 (photoshop uxp host adapter), RFC-0004 (shared protocol & constants), RFC-0007 (tests), ADR docs/adr/0005 (identity dedup), docs/adr/0006 (constants transcribed on demand), docs/adr/0007 (executeAsModal), docs/adr/0009 (declarative type/value/collection registries)

## Summary

Add the first new DOM class cluster on top of the now-complete batch-0.5 foundation (RFC-0008): **Channels** collection + **Channel** RemoteObject, plus the **SolidColor** value object (pulled forward from batch 3 because `Channel.color` depends on it), the **histogram** value (a plain `number[256]`), and the **ChannelType** constant enum. This is the roadmap's designated *minimum complete smoke test* of the three foundation registries: it exercises (1) a brand-new RemoteObject type registered in the type registry, (2) a new snapshot collection reusing `createSnapshotCollection` with `getByName`/`add`, (3) a cross-class reference `Channel.parent → Document` resolved lazily, and (4) the value-object registry with both a trivial value (`histogram`) and a non-trivial one (`SolidColor`, a bidirectional multi-color-model value). The success criterion: adding Channel is *registration + descriptor declaration + host Set entries*, with **zero edits to the foundation code** (`registry.ts`, `remote-class.ts`, `value-objects.ts`, `createSnapshotCollection`). If the foundation needs a change to accommodate Channel, that is a finding to feed back into RFC-0008's design, not a silent patch here.

## Context & Problem

RFC-0008 generalized the per-class hand-wiring into three declarative registries but had exactly one consumer (the migrated Document/Layer/Layers). "Generalizes cleanly" is unproven until a *second, differently-shaped* class goes through it without touching the foundation. Channel is chosen as that probe because it is the lowest-risk new class that still touches every foundation mechanism:

- **New RemoteObject + new collection**: `Channels` is structurally identical to `Layers` (indexable, `getByName`, `add`, `length`, `parent`) — it should fall out of `createSnapshotCollection` with only a member-kind change, proving the factory is truly member-agnostic.
- **Cross-class reference**: `Channel.parent → Document` and `Channel.duplicate(targetDocument?) ` close a Channel↔Document cycle (Document→channels→Channel→parent→Document), exercising the lazy type-registry resolution that ADR 0009 exists for.
- **Value objects, both easy and hard**: `histogram` is a `number[]` (trivial value), while `color` is a `SolidColor` — the hardest value object in the whole surface (six nested color models, stateful model-switching in Photoshop, an `isEqual` method). Validating SolidColor now, on the smallest possible carrier class, de-risks batch 3 and TextItem (batch 4) which lean on it heavily.

The `Channel.color` dependency is why SolidColor is pulled forward from batch 3 (grilling decision 2026-07-08): shipping Channel with `color` stubbed would leave a hole in the first smoke test and force a Channel revisit later. Doing SolidColor here makes batch 1 the real end-to-end proof.

## Design

### 1. SolidColor value object (shared + webview + host)

SolidColor is modeled as a **bidirectional value object**, *not* a RemoteObject and *not* a resource handle. Rationale: in the Adobe DOM, `SolidColor` is a synchronous, in-memory object (`new SolidColor()` constructs locally, properties read/write synchronously, no document handle, no `dispose`). It has no stable remote identity to dedup and no lifecycle to manage — it is data with derived views. Forcing it through the handle registry would add TTL/dispose semantics it does not need and break the "resource handles require explicit cleanup; value objects do not" rule (spec §4 / ADR 0005).

- **Canonical transport shape**: normalize to a single canonical color model on the wire to avoid Photoshop's implicit model-switching leaking across the bridge. The envelope carries the RGB representation plus the source `typename` (base model), as a plain-JSON value:

  ```ts
  // src/shared/photoshop-api/value-objects.ts registration
  interface SolidColorTransport {
    readonly rgb: { red: number; green: number; blue: number; hexValue: string };
    readonly hsb: { hue: number; saturation: number; brightness: number };
    readonly cmyk: { cyan: number; magenta: number; yellow: number; black: number };
    readonly lab: { l: number; a: number; b: number };
    readonly gray: { gray: number };
    readonly typename: string; // the base color model at read time ("RGBColor", "CMYKColor", ...)
  }
  ```

  Registered via a **custom `{ serialize, deserialize }`** spec (not a flat `fields` list), because the host must read each nested color-model view off the live `SolidColor` and the WebView reconstructs a plain object exposing the same views. `nearestWebColor` and `isEqual` are **out of scope for v1** (nearestWebColor is a derived RGB read; `isEqual` needs a live SolidColor pair — deferred until there is a concrete consumer).
- **WebView surface**: `PsSolidColor` is a plain readonly object of the five color-model views (`{ rgb, hsb, cmyk, lab, gray, typename }`), decoded synchronously from the envelope (no RPC, no Promise — it is already fully materialized, like `ImagingBounds`).
- **Writing `channel.color = someColor`**: the WebView setter accepts a `SolidColorInput` (a partial `{ rgb?: {...} }` etc. or a `PsSolidColor`), serializes it into the transport envelope, and sends it through the existing keyed `channel.propertySet` path. The host deserializes it into a real `SolidColor` before assignment. **No new write mechanism** — this reuses the ADR 0003 write queue.
- **`SolidColor` construction on the WebView** (`photoshop.app.SolidColor`) is **out of scope**; v1 only round-trips colors that originate from a channel read or a plain input literal. A first-class constructible `PsSolidColor` is a batch-3 concern.

### 2. histogram value

`Channel.histogram` is a `number[]` of length 256 (read-only, and only valid when the channel is visible). Modeled as a `scalar` result kind (a raw JSON array passes through untouched) — it needs no value-object registration. The host reads `channel.histogram` directly; if Photoshop throws (channel not visible / no longer exists), that surfaces as a `BridgeRemoteError` per the standard host error path. **No special handling.**

### 3. Channel RemoteObject (webview + host)

`src/webview/photoshop-api/modules/photoshop/channel.ts`, mirroring `layer.ts` exactly (class factory, declarative descriptor tables, `declare` members locked by the ADR 0002 static test).

- **Scalar properties** (shared keyed `channel.propertyGet`/`propertySet`):
  - read-only: `id`? — *Channel has no documented `id` in ps-reference*; see Open Questions. Provisionally use `name` + `parent` id for the registry key.
  - read/write scalars: `name`, `opacity`, `visible`, `kind` (a `ChannelType` enum string).
- **Value property**: `histogram` (read-only, scalar-array), `color` (read/write, `valueKind: "SolidColor"`).
- **Reference property**: `parent` (read-only, `refType: "Document"`).
- **Methods** (all mutating → executeAsModal): `duplicate(targetDocument?)` (returns `void` per ps-reference — it duplicates into the parent/target doc, does not return the new channel), `merge()`, `remove()`.
- **Registration**: `registry.register("Channel", factory)` in `photoshop.ts`; `registry.registerCollectionCapabilities("Channel", { getByName: "channels.getByName", add: "channels.add" })`.

### 4. Channels collection

Reuse `createSnapshotCollection({ memberKind: "Channel", capabilities: { getByName, add } })` verbatim — **no factory change expected**. `removeAll()` (a `Channels` method with no member return) is added as a third optional capability *only if* it cannot be expressed as a plain owner-keyed RPC; first attempt is to expose it as a namespace/collection method without extending the factory's capability set. See Open Questions.

### 5. Document channel entry points

`Document` gains three collection/reference properties feeding Channel:

- `channels` → `collection("Channel")`
- `componentChannels` → `collection("Channel")` (array of component channels)
- `activeChannels` → `collection("Channel")` (array of active/selected channels; note: per ps-reference this is read/write on Document — writing selects channels; v1 exposes **read-only**, write deferred)

These are added to `Document`'s descriptor table, `PHOTOSHOP_RESULT_KINDS[Document].properties`, and the Document host scalar/collection dispatch — following exactly the pattern `layers`/`activeLayers`/`artboards` already established.

### 6. ChannelType constant

Transcribe `ChannelType` from `@shared-types/photoshop` Constants into `photoshop-constants.ts` as an `as const` object (ADR 0006, on-demand). Expose on the namespace as `photoshop.ChannelType`. Add the static test asserting its value union is compatible with the Adobe enum type.

## Scope

**In scope**
- `src/shared/photoshop-api/photoshop-constants.ts`: add `ChannelType` (+ value-union type + static-compat test).
- `src/shared/photoshop-api/value-objects.ts`: register `SolidColor` (custom serialize/deserialize) — the only foundation-adjacent change, and it is *using* the registry, not modifying it.
- `src/shared/photoshop-api/photoshop-protocol.ts`: add `Channel` to `PHOTOSHOP_REMOTE_TYPE`; add `Channel` entry to `PHOTOSHOP_RESULT_KINDS`; add `Document.channels`/`componentChannels`/`activeChannels` result kinds; add the `channel.*` and `channels.*` method names.
- `src/webview/photoshop-api/modules/photoshop/channel.ts`: `PsChannel` class factory + descriptors + `declare` members.
- `src/webview/photoshop-api/modules/photoshop/types.ts`: `PsChannel`, `Channels`, `PsSolidColor`, `SolidColorInput` type surfaces; add channel entry points to `PsDocument`.
- `src/webview/photoshop-api/modules/photoshop/photoshop.ts`: register `Channel` type + collection capabilities; expose `ChannelType`; wire `Document.channels` etc.
- `src/uxp/photoshop-api/modules/photoshop/host.ts`: add `CHANNEL_SCALARS`, `CHANNEL_WRITABLE_SCALARS`, `CHANNEL_MUTATING_METHODS` sets; `channel.*`/`channels.*` dispatch branches; SolidColor serialize/deserialize hookup; Document channel-collection dispatch.
- `src/uxp/photoshop-api/modules/photoshop/types.ts`: `PhotoshopChannelLike` host DOM interface + `channels`/`componentChannels`/`activeChannels` on `PhotoshopDocumentLike`.
- Static tests: descriptor-keys === declare-keys for `PsChannel`; `PHOTOSHOP_RESULT_KINDS` in sync with WebView descriptors for Channel + Document new props; ChannelType compat; SolidColor value-kind uniqueness; **the "foundation untouched" assertion** (see Testing).
- CDP cases: `photoshop.channels-collection`, `photoshop.channel-read-write`, `photoshop.channel-color-solidcolor`, `photoshop.channel-parent-document-identity`.

**Out of scope**
- SolidColor `nearestWebColor`, `isEqual`, and WebView-side `new SolidColor()` construction (batch 3).
- `Document.activeChannels` write (channel selection); `Channels.removeAll` if it forces a factory change (see Open Questions).
- Any other DOM class (batch 2+).
- Any change to the foundation registries themselves — if one is needed, stop and amend RFC-0008.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| Remote type | Add `"Channel"` to `PHOTOSHOP_REMOTE_TYPE` |
| Value object | Register `"SolidColor"` (custom serialize/deserialize) in `value-objects.ts` |
| Constant | Add `photoshop.ChannelType` |
| Document props | `channels`, `componentChannels`, `activeChannels` (all `collection("Channel")`, read-only in v1) |
| Wire methods | `channel.propertyGet/propertySet/batchGet/batchSet/dispose`, `channel.duplicate/merge/remove`, `channels.snapshot/getByName/add` |
| Public API | **Additive only** — no existing `photoshop`/`PsDocument`/`PsLayer` behavior changes |
| Foundation code | **No change** — success is defined as touching zero foundation files |

## Implementation plan

1. **Shared constants**: transcribe `ChannelType` into `photoshop-constants.ts` + value-union type + static-compat test.
2. **Shared value object**: register `SolidColor` in `value-objects.ts` with custom `serialize` (read rgb/hsb/cmyk/lab/gray + typename off the live SolidColor) / `deserialize` (build the plain views object). Add `SolidColorTransport` type.
3. **Shared protocol**: extend `PHOTOSHOP_REMOTE_TYPE`, `PHOTOSHOP_RESULT_KINDS` (Channel + Document new props), and `PHOTOSHOP_METHOD_NAMES` (`channel.*`, `channels.*`).
4. **WebView types**: add `PsChannel`, `Channels`, `PsSolidColor`, `SolidColorInput`; extend `PsDocument` with the three channel entry points.
5. **WebView channel.ts**: build `PsChannel` factory mirroring `layer.ts` (descriptors + declare + method names).
6. **WebView photoshop.ts**: `registry.register("Channel", ...)`; `registerCollectionCapabilities("Channel", ...)`; expose `ChannelType`; wire Document channel props.
7. **Host types + host.ts**: `PhotoshopChannelLike`; `CHANNEL_*` sets; `channel.*`/`channels.*` dispatch; SolidColor host serialize/deserialize; Document channel-collection serialization (reuse `serializeSnapshot`).
8. **Static tests**: PsChannel keys lock, result-kind sync, ChannelType compat, SolidColor kind uniqueness, foundation-untouched assertion.
9. **Verify**: `pnpm typecheck` + `pnpm test:static`; then `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp` for the new CDP cases. Confirm all existing RFC-0007 cases still pass unchanged.

## Testing

- **Static (no Photoshop)**:
  - PsChannel: `keyof properties ∪ keyof methods === declare` key set (ADR 0002).
  - `PHOTOSHOP_RESULT_KINDS[Channel]` and the new Document props match the WebView descriptors' `refType`/`valueKind`/`collectionOf` (no dangling names; `"Channel"` and `"SolidColor"` both resolve to registered entries).
  - `ChannelType` value union assignable to the Adobe `Constants.ChannelType` type; `"SolidColor"` valueKind is unique in the value-object registry.
  - **Foundation-untouched**: a test (or a documented reviewer checklist item) asserting this RFC's diff touches no line in `registry.ts` / `remote-class.ts` / `value-objects.ts` core / `createSnapshotCollection`. If it does, the change belongs in RFC-0008.
- **WebView unit seam (stubbed rpc)**:
  - `channel.color` decodes a `SolidColor` envelope to the plain views object; `channel.color = { rgb: { red, green, blue } }` serializes to the envelope and enqueues one `channel.propertySet`.
  - `doc.channels` builds a snapshot collection whose `[i]` resolves to a `===`-cached `PsChannel` and whose `getByName`/`add` issue the declared RPCs.
  - `channel.parent` decodes to the *same* `PsDocument` instance the channel came from (`===`), proving the Channel↔Document cycle resolves through the shared type registry.
- **CDP (live Photoshop)**:
  - `photoshop.channels-collection`: `doc.channels.length`, iteration, `getByName`, element `===` stability, container `!==` (snapshot semantics), matching the `layers-collection` case.
  - `photoshop.channel-read-write`: read `name`/`opacity`/`visible`/`kind`; write `opacity`, read-your-writes.
  - `photoshop.channel-color-solidcolor`: read `channel.color` (assert the five model views + typename present), write a color, read it back; assert histogram is a 256-length array on a visible channel.
  - `photoshop.channel-parent-document-identity`: `(await channel.parent) === doc` for a channel obtained from `doc.channels`.

## Dependencies

Depends on RFC-0008 (foundation) being landed — it is. Must land as one unit (shared + webview + host) because `test/static/check-boundaries.mjs` enforces module-tree symmetry and the envelope/method-name shapes are shared. Independent of RFC-0009 (batchPlay) and RFC-0010 (imaging), both already landed. Batch 2 (bulk homogeneous collections) is unblocked once this proves the factory reuse pattern.

## Open Questions

1. **Channel identity key**: ps-reference documents no `id` on Channel. What is the stable dedup key for the handle registry? Candidates: (a) the underlying batchPlay/DOM channel index within `parent.channels`, (b) `parent.id + name` composite. Index is unstable across add/remove; name is not guaranteed unique. **Recommended**: key on `Document:${docId}:Channel:${channelIndexAtReadTime}` and accept that a channel's identity is snapshot-scoped (same rule as collection members) — resolve during design step 5, and if no stable key exists, document Channel as a non-deduped RemoteObject (each read yields a fresh proxy, no `===` guarantee) and drop the `channel-parent-document-identity`'s *channel*-side `===` assertion (keep the Document-side one).
2. **`Channels.removeAll()`**: can it be a plain owner-keyed RPC (`channels.removeAll` with `[ownerRef]`) exposed as a collection method, or does it force a new capability in `createSnapshotCollection`? If the latter, it moves out of scope (do not touch the factory).
3. **`SolidColor` write ergonomics**: is `SolidColorInput` a discriminated partial (`{ rgb }` | `{ cmyk }` | ...) or an always-RGB literal for v1? Recommended: accept any single-model partial and let the host set the corresponding sub-model, matching Adobe's model-switch-on-write behavior.
