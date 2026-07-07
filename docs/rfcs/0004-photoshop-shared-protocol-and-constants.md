# RFC-0004: Photoshop shared protocol and constants foundation

Status: ready-for-agent
Source: notes/photoshop-module-spec.md (§0, §2–§6), approved plan "Photoshop 模块开发计划（核心对象全量）"
Related: ADR docs/adr/0003 (property-write-and-batch-semantics), docs/adr/0004 (shared-remote-reference-and-handle-registry), docs/adr/0006 (constants-in-shared-transcribed-on-demand), docs/adr/0007 (execute-as-modal-boundary), RFC-0005, RFC-0006, RFC-0007, CONTEXT.md

## Summary

Establish the runtime-neutral contract that both the WebView proxies and the UXP host adapter for the `photoshop` module will speak: a `photoshop-protocol.ts` (module id, the full method-name vocabulary, remote reference `type` constants, the `ImagingBounds` value-object serialization shape, and an assert helper) and a `photoshop-constants.ts` carrying the six Adobe enums transcribed as `as const` runtime values. This RFC delivers no behavior on its own — it is the shared vocabulary every other Photoshop RFC imports, so it lands first and lands alone.

## Context & Problem

Per the module boundaries (`AGENTS.md`), `src/shared` owns runtime-neutral protocol, transport shapes, and constants, and must not contain concrete `photoshop`/`os`/`fs` implementations. The WebView side (RFC-0005) and the UXP host side (RFC-0006) must not import each other; their only common ground is `src/shared`. Both sides need to agree, byte-for-byte, on: which method names cross the bridge, what a Document/Layer remote reference `type` string is, and exactly which fields an `ImagingBounds` value object carries. Adobe's `.d.ts` enums (`LayerKind`, `BlendMode`, …) are *type-only* — they ship no runtime values — so the enums used this batch must be manually transcribed to `as const` objects in shared and shared by both sides. This RFC captures all of that so RFC-0005/0006 have a single, authoritative contract to build against.

## Design

**Module identity.** `PHOTOSHOP_MODULE_ID = "uxp-api/modules/photoshop"`, matching the existing `uxp-api/modules/*` module-id convention so the boundary checker's `uxp-api` symmetry rule applies unchanged.

**Method-name vocabulary.** The bridge dispatches by string method name. This RFC defines the complete set for the core objects as `as const` groups plus a derived union type, organized by owner:

- `app.*` — namespace entry points: `activeDocument`, `documents`, `open`.
- `document.*` — per-property `get`/`set`, each method, `batchGet`, `batchSet`, `dispose`.
- `layer.*` — per-property `get`/`set`, each method, `batchGet`, `batchSet`, `dispose`.
- `layers.*` — collection operations: `snapshot`, `getByName`, `add`.

Concrete property/method membership is enumerated in RFC-0005 (the "闭环成员清单"); this RFC owns the *encoding* of those names into the protocol constant tables and the union type. A method name is a dotted string (e.g. `"layer.propertyGet"` carrying a property key in the payload, or an explicit `"document.close"`). Follow the xmp protocol's existing shape for how get/set/method/batch are keyed.

**Reference `type` constants.** The remote reference envelope is the shared `{ kind: "uxp.remote.ref", type, id }` (ADR 0004). This RFC exports the two `type` string constants used this batch: `PHOTOSHOP_REMOTE_TYPE.Document = "Document"` and `PHOTOSHOP_REMOTE_TYPE.Layer = "Layer"`. Both sides map these strings ↔ their concrete classes (UXP registry keys, WebView identity caches).

**ImagingBounds value-object shape.** `ImagingBounds` is a value object (ADR 0005): plain JSON, no handle, no methods. This RFC defines the canonical field list as a constant (`IMAGING_BOUNDS_FIELDS = ["left","right","top","bottom","width","height"] as const`) and the corresponding transport type. The UXP host serializer (RFC-0006) copies exactly these fields; the WebView decoder (RFC-0005) reconstructs a plain object from exactly these fields. Sharing the field-list constant guarantees the two sides never drift.

**Assert helper.** `assertPhotoshopProtocolMethodName(name): asserts name is PhotoshopProtocolMethodName` — throws on an unknown method name. The UXP host dispatch uses it as its first gate ("先校验 method"); it also gives the WebView side a compile-time-exhaustive union to build against.

**Constants.** `photoshop-constants.ts` transcribes six enums as `as const` objects, each annotated with its Adobe source (`internal/dom/Constants.d.ts` line region + the Photoshop UXP reference URL). Runtime values captured from the source `.d.ts`:

| Enum | Members (value) |
| --- | --- |
| `SaveOptions` | `DONOTSAVECHANGES=0`, `PROMPTTOSAVECHANGES=1`, `SAVECHANGES=2` |
| `AnchorPosition` | 9 members, string-valued: `TOPLEFT='top-left'` … `BOTTOMRIGHT='bottom-right'`, `MIDDLECENTER='middle-center'`, etc. |
| `BlendMode` | 28 members, `NORMAL='normal'` … `PASSTHROUGH='passThrough'` (note `SUBTRACT='blendSubtraction'`, `DIVIDE='blendDivide'`) |
| `LayerKind` | 26 members, `NORMAL='pixel'`, `SMARTOBJECT='smartObject'`, `SOLIDFILL='solidColor'`, `TEXT='text'`, `GROUP='group'`, … |
| `ElementPlacement` | `PLACEBEFORE='placeBefore'`, `PLACEATBEGINNING='placeAtBeginning'`, `PLACEATEND='placeAtEnd'`, `PLACEAFTER='placeAfter'`, `PLACEINSIDE='placeInside'` |
| `FlipAxis` | `HORIZONTAL='horizontal'`, `VERTICAL='vertical'`, `BOTH='both'` |

Only enums used by this batch are transcribed; unused enums are deliberately not pre-transcribed (ADR 0006). The WebView namespace re-exposes these (RFC-0005) so users write `photoshop.LayerKind.TEXT`.

## Scope

**In scope**
- `src/shared/uxp-api/photoshop-protocol.ts`: module id, method-name groups + union type, `assertPhotoshopProtocolMethodName`, reference `type` constants, `ImagingBounds` field-list constant + transport type.
- `src/shared/uxp-api/photoshop-constants.ts`: the six `as const` enums above, each with a documented Adobe source.

**Out of scope**
- Any `RemoteClass` subclass, namespace, decoder, or WebView export — RFC-0005.
- Any host adapter, dispatch, registry usage, or serializer *implementation* — RFC-0006 (this RFC only defines the shapes they share).
- The static compatibility test asserting the `as const` values match `@shared-types/photoshop` — RFC-0007. **Note:** the `@shared-types/photoshop` alias resolves to `src/shared/types/photoshop/src/*`, which does not currently exist; the real enums live in the ambient `declare module 'photoshop'` under `internal/dom/Constants.d.ts`. Resolving how to reference them for the compatibility assertion is RFC-0007's problem, not this RFC's — this RFC only transcribes the runtime values.
- Constants beyond the six listed (transcribed on demand in future batches).

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| New shared file | `src/shared/uxp-api/photoshop-protocol.ts` |
| Module id | `PHOTOSHOP_MODULE_ID = "uxp-api/modules/photoshop"` |
| Method names | `as const` groups (`app`/`document`/`layer`/`layers`) + derived `PhotoshopProtocolMethodName` union |
| Assert helper | `assertPhotoshopProtocolMethodName(name)` (throwing type guard) |
| Reference types | `PHOTOSHOP_REMOTE_TYPE = { Document: "Document", Layer: "Layer" } as const` |
| Value shape | `IMAGING_BOUNDS_FIELDS` constant + `ImagingBoundsTransport` type (`{ left, right, top, bottom, width, height }`) |
| New shared file | `src/shared/uxp-api/photoshop-constants.ts` |
| Constants | `LayerKind`, `BlendMode`, `AnchorPosition`, `ElementPlacement`, `SaveOptions`, `FlipAxis` as `as const` objects |

## Implementation plan

1. Add `photoshop-constants.ts` with the six `as const` enums, each preceded by a comment citing its `Constants.d.ts` line region and the Adobe reference URL. Export a derived value-type per enum (`type LayerKindValue = (typeof LayerKind)[keyof typeof LayerKind]`).
2. Add `photoshop-protocol.ts`: `PHOTOSHOP_MODULE_ID`, the `PHOTOSHOP_REMOTE_TYPE` constants, and `IMAGING_BOUNDS_FIELDS` + `ImagingBoundsTransport`.
3. In the same file, define the four method-name `as const` groups and the derived `PhotoshopProtocolMethodName` union, mirroring the xmp protocol's get/set/method/batch keying.
4. Add `assertPhotoshopProtocolMethodName` as a throwing `asserts` type guard over the union.
5. Run `pnpm typecheck` and `pnpm test:static` — no behavior yet, but the shared file must compile and satisfy boundary/import rules (no `../../`, aliases only, no concrete host imports).

## Testing

This RFC ships no runtime behavior, so it is verified structurally rather than at a behavioral seam:
- `pnpm typecheck` passes with the two new shared files.
- `pnpm test:static` passes — the files respect shared-layer boundaries (runtime-neutral, no `photoshop`/`fs`/`os` concrete imports, no deep relative imports).
- The exhaustive compatibility test that asserts the transcribed `as const` values equal Adobe's enum values is defined and owned by RFC-0007; it consumes the constants this RFC produces.

## Dependencies

None — can start immediately. It is the foundation for RFC-0005, RFC-0006, and RFC-0007.

## Open questions

None. (The `@shared-types/photoshop` alias/`src`-subdir discrepancy is real but is deferred to RFC-0007, which owns the compatibility assertion; this RFC only transcribes runtime values from the known-good `internal/dom/Constants.d.ts`.)
