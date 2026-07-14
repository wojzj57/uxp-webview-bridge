# RFC-0014: Photoshop class surface completion

Status: implemented
Source: `notes/reports/2026-07-13-photoshop-webview-coverage-review.md`, lines 139-198
Related: RFC-0005 through RFC-0013; `notes/photoshop-module-spec.md`; `notes/photoshop-full-coverage-roadmap.md`

## Summary

Close every remaining missing Photoshop class and every transportable partial class in the coverage table. The batch adds the complete TextItem object graph, completes Layer and Layers, promotes the color-model and path-builder inputs into constructible WebView value classes, and keeps all real Photoshop work on the UXP host.

The resulting Shared-class mapping target is 55 complete or basically complete classes, one partial class, and zero missing classes. `Document` remains the sole partial class because its final member, `suspendHistory(callback, historyStateName)`, requires a general bidirectional, re-entrant callback protocol rather than another ordinary RemoteClass method.

## Audited baseline and target

The current table contains 56 Shared classes:

| State | Baseline | Target |
| --- | ---: | ---: |
| Complete or basically complete | 42 | 55 |
| Partial | 10 | 1 |
| Missing | 4 | 0 |

This batch closes the following runtime-documented surfaces:

| Family | Baseline | Target |
| --- | ---: | ---: |
| Layer + Layers | 39/87 | 87/87 |
| Path/geometry | 35/44 | 44/44 |
| Text | 10/79 | 79/79 |
| All class/collection families | 380/507 | 506/507 |

It also closes the Shared-class correspondence for `CMYKColor`, `GrayColor`, `HSBColor`, `LabColor`, and `RGBColor`. These color-model classes are not additional remote handles; they are constructible WebView-local value classes used by `SolidColor`.

## Goals

1. Implement `CharacterStyle` with all 33 writable properties and `reset`.
2. Implement `ParagraphStyle` with all 14 writable properties and `reset`.
3. Implement `TextWarpStyle` with all five writable properties and `reset`.
4. Implement `TextItem` with its ten properties, four methods, style references, parent Layer identity, queued writes, and modal mutations.
5. Complete `Layer` to all 83 documented members, including `typename`, `textItem`, group `layers`, front/back ordering, clear/copy/cut/skew, and every documented `apply*` filter.
6. Complete `Layers` with `typename` and support snapshots owned by either Document or a group Layer.
7. Replace `PathPointInfoInput` and `SubPathInfoInput` as the primary public surface with constructible `PathPointInfo` and `SubPathInfo` value classes while retaining the input aliases for compatibility.
8. Export constructible `CMYKColor`, `GrayColor`, `HSBColor`, `LabColor`, and `RGBColor` value classes and use them as SolidColor model views.
9. Preserve public entrypoint, type-registry, queued-write, reference-identity, value-transport, and modal-execution rules.

## Non-goals

- Do not implement `Document.suspendHistory` without the separate callback/event protocol.
- Do not add Action/Core notification listeners or otherwise expand module surfaces outside the class table.
- Do not expose native constructors for stateful DOM objects in the WebView.
- Do not turn Text styles into plain snapshots: their mutable host state requires RemoteObject semantics.
- Do not run destructive filter tests against user documents.

## Object model

### TextItem and styles are RemoteObjects

`TextItem`, `CharacterStyle`, `ParagraphStyle`, and `TextWarpStyle` are mutable native objects. Each gets a dedicated remote type, descriptor table, WebView class, host dispatch path, and result-kind entry.

Photoshop does not expose stable ids for these nested objects. Their identity is derived from the owning Document and Layer ids (Photoshop can reuse a Layer id after a temporary document closes):

- `TextItem:<documentId>:<layerId>`
- `CharacterStyle:<documentId>:<layerId>`
- `ParagraphStyle:<documentId>:<layerId>`
- `TextWarpStyle:<documentId>:<layerId>`

The host remembers ownership while serializing `Layer.textItem` and each TextItem style property. Repeated reads therefore resolve to the same remote reference and the same WebView RemoteObject while the owning layer exists. Persistent text references do not expose user disposal requirements beyond the existing optional RemoteClass cleanup path.

All text property reads are direct. Every text/style setter, `reset`, and conversion method is a Photoshop mutation and runs in `executeAsModal`. Queued setters flush before later reads or calls.

### Color models are local value classes

The five color-model classes have no independent host identity. They become synchronous WebView-local classes with documented defaults, writable fields, exact `typename`, range validation, and JSON-safe data projection.

`SolidColor.rgb`, `.hsb`, `.cmyk`, `.lab`, and `.gray` return these concrete classes. Existing structural inputs remain accepted, so callers using object literals do not break. The SolidColor argument encoder serializes explicit model fields rather than depending on enumerable prototype getters.

### Path builders are local value classes

`PathPointInfo` and `SubPathInfo` are construction-time values. They become synchronous classes with writable fields, exact `typename`, documented defaults, and transport-safe enumerable data. The existing `PathPointInfoInput` and `SubPathInfoInput` names remain compatibility aliases to the structural input accepted by `PathItems.add`.

No UXP handle is allocated for color models or path builders.

## Layer completion

The Layer descriptor gains the missing scalar/reference/collection properties:

- `typename`
- `textItem -> TextItem`
- `layers -> Layers | null`

The method table gains every missing native operation from the vendored Photoshop 26.10 declaration:

- ordering and editing: `bringToFront`, `sendToBack`, `clear`, `copy`, `cut`, `skew`
- filters: `applyAddNoise`, `applyAverage`, `applyBlur`, `applyBlurMore`, `applyClouds`, `applyCustomFilter`, `applyDeInterlace`, `applyDespeckle`, `applyDifferenceClouds`, `applyDiffuseGlow`, `applyDisplace`, `applyDustAndScratches`, `applyGaussianBlur`, `applyGlassEffect`, `applyHighPass`, `applyLensBlur`, `applyLensFlare`, `applyMaximum`, `applyMinimum`, `applyMedianNoise`, `applyMotionBlur`, `applyNTSC`, `applyOceanRipple`, `applyOffset`, `applyPinch`, `applyPolarCoordinates`, `applyRipple`, `applySharpen`, `applySharpenEdges`, `applySharpenMore`, `applyShear`, `applySmartBlur`, `applySpherize`, `applyTwirl`, `applyUnSharpMask`, `applyWave`, `applyZigZag`, and `applyImage`

All Layer methods remain ordinary Promise-returning WebView calls and execute inside one host modal scope. Result kinds stay declarative: only `duplicate`, `merge`, and `link` return references/collections; the remainder return void.

`applyDisplace` and `applyGlassEffect` accept existing `UxpStorageFile` proxies. Recursive host decoding recognizes UXP storage references before Photoshop remote references and resolves them through the existing persistent-file-storage host registry.

`Layer.layers` is nullable for non-group layers. The shared collection result serializer therefore preserves `null` rather than trying to snapshot it. A non-null group snapshot carries the Layer owner reference, so `getByName` and `add` route to that group's native collection.

## Public API and compatibility

New exact public class names are exported from `uxp-webview-bridge/webview` and its Photoshop submodule:

- `CharacterStyle`, `ParagraphStyle`, `TextItem`, `TextWarpStyle`
- `CMYKColor`, `GrayColor`, `HSBColor`, `LabColor`, `RGBColor`
- `PathPointInfo`, `SubPathInfo`

Stateful text classes are type exports whose runtime instances are produced by remote decoding. Value classes are runtime constructor exports. `app` exposes the local `SolidColor`, `PathPointInfo`, and `SubPathInfo` constructors for native-style ergonomics; the package entrypoint also exports them directly.

Existing `PsLayer`, `RgbColorView`, other color-view names, and path input names remain supported as compatibility types. No deprecated bridge factory/setup API is introduced.

## Shared protocol and host dispatch

The shared remote type and result-kind tables add TextItem and the three style types. Layer result kinds add `textItem` and `layers`; TextItem result kinds add parent and style references plus Point values for `textClickPoint`.

Host dispatch follows one declarative text-object helper:

- validate the exact remote type and allowed property/method name
- validate writable property keys before decoding values
- serialize values/references through `PHOTOSHOP_RESULT_KINDS`
- execute setters, batchSet, reset, and conversion calls modally
- execute propertyGet and batchGet directly

Layer dispatch expands its allowlists and uses the same generic native method call path. It validates remote references and UXP File envelopes before touching Photoshop. Native range and mode validation remains authoritative for filter-specific numeric constraints; the bridge validates transport shapes and never coerces invalid values.

## Verification

### Contract and static evidence

- exact class manifest proves 55 complete, one partial, zero missing
- exact Layer member manifest proves 83/83 and Layers proves 4/4
- exact Text manifests prove CharacterStyle 34/34, ParagraphStyle 15/15, TextWarpStyle 6/6, TextItem 14/14, and TextFont(s) 10/10
- exact path-builder manifests prove PathPointInfo 5/5 and SubPathInfo 4/4
- descriptor/type/result-kind/RPC tables remain mutually consistent
- Text ownership gives stable references across repeated reads
- queued text/style writes flush before reads and methods
- every new mutation enters modal execution; reads do not
- nullable group `layers` survives transport as null
- UXP File parameters resolve for file-backed filters
- value constructors enforce defaults, typename, range/hex behavior, and argument serialization
- invalid keys, references, and unsupported methods reject before native calls

### Real Photoshop CDP evidence

- create and own a disposable text-layer fixture
- read/write representative TextItem, CharacterStyle, ParagraphStyle, and TextWarpStyle properties and restore or close in `finally`
- convert point/paragraph text where the host supports it and prove stable TextItem identity
- create a group layer, read its nested Layers snapshot, and add/read a child layer
- run representative safe filter/edit calls only on an owned pixel layer; contract tests cover routing for the complete filter vocabulary
- construct colors and path builders in the WebView and use them through real SolidColor/path APIs
- never mutate a user document

### Gates

Run `pnpm typecheck`, `pnpm test:static`, `pnpm test:contract`, `pnpm test`, `pnpm build`, `pnpm exec tsc -p tsconfig.cdp-webview.json`, and `pnpm test:uxp`.

## Decision

Proceed as one class-completion vertical slice. All remaining missing classes and all transportable partial classes are included. `Document.suspendHistory` is the only accepted partial result because solving it correctly changes the bridge protocol direction and lifecycle model; it remains assigned to a separate callback/event RFC.
