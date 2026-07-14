# RFC-0013: Photoshop Document complete surface and direct DOM families

Status: implemented
Source: `notes/reports/2026-07-13-photoshop-webview-coverage-review.md`, especially the `Document -> PsDocument` 45/66 finding
Related: RFC-0005, RFC-0006, RFC-0007, RFC-0008, RFC-0011, RFC-0012; `notes/photoshop-module-spec.md`; `notes/photoshop-full-coverage-roadmap.md`

## Summary

Raise the documented `Document` runtime surface from 45/66 members to 65/66 without pretending that a WebView callback can execute inside one UXP modal scope. The slice adds every transportable Document property and method, including the newer documented `zoom`, closes the ColorSampler(s), CountItem(s), and LayerComp(s) dependency families, and closes the remaining Channels collection surface.

`Document.suspendHistory(callback, name)` is the sole accepted exception. Exact compatibility requires a general UXP-to-WebView callback protocol with re-entrant request handling and cancellation/error semantics; serializing the callback, running it outside the native modal scope, or replacing it with a declarative operation list would all be false compatibility. That protocol is not introduced incidentally inside a DOM coverage batch.

This remains one vertical Photoshop module slice across shared protocol/result kinds, WebView declarations and RemoteObjects, UXP dispatch/serialization, contract tests, and live CDP cases.

## Goals

1. Add the 13 missing documented Document properties:
   - `saveAs`, `bitsPerChannel`, `colorProfileName`, `colorProfileType`, `colorSamplers`, `compositeChannels`, `countItems`, `histogram`, `layerComps`, `mode`, `quickMaskMode`, `typename`, and `zoom`
2. Add the seven directly transportable missing Document methods:
   - `calculations`, `changeMode`, `convertProfile`, `generativeUpscale`, `sampleColor`, `splitChannels`, and `trap`
3. Implement every documented member of ColorSampler, ColorSamplers, CountItem, CountItems, LayerComp, and LayerComps rather than returning untyped objects.
4. Close Channels with `parent`, `typename`, and `removeAll`, and support the documented writable `Document.activeChannels` and `Document.activeLayers` properties.
5. Align existing Document signatures and nullable/void results with the current Adobe reference while retaining source-compatible overloads for the bridge's legacy option bags.
6. Preserve queued-write ordering, stable references where the native DOM exposes stable identity, modal execution for mutations, direct execution for reads, and transport-safe UXP File/value-object handling.

## Non-goals

- Do not expose Adobe's ignored native `Document` constructor in the WebView. The 66-member denominator excludes constructors.
- Do not add a second setup/factory API.
- Do not create a Document-only callback tunnel or claim that a locally executed callback is equivalent to `suspendHistory`.
- Do not implement unrelated Text or Layer long-tail members.
- Do not use an existing user document as destructive CDP fixture state.

## Coverage target

The reference snapshot contains 37 Document properties and 29 methods. The existing bridge covers 24 properties and 21 methods. This RFC adds 13 properties and seven methods, producing 37/37 properties and 28/29 methods: 65/66 overall. If the separate callback-protocol decision is changed to include exact `suspendHistory`, the target becomes 66/66 and this RFC must be expanded before implementation.

The direct dependency target is complete documented coverage:

| Family | Target |
| --- | ---: |
| ColorSampler + ColorSamplers | 11/11 |
| CountItem + CountItems | 21/21 |
| LayerComp + LayerComps | 22/22 |
| Channel + Channels | 16/16 |

`NoColor` is added as a transport-safe value result because `sampleColor` and `ColorSampler.color` return `SolidColor | NoColor`.

## Module design

### 1. Document remains the deep public module

`PsDocument` remains a `RemoteClass`. Scalar/reference/collection members continue to use its descriptor table and the shared keyed property RPCs. The host readable and writable sets are expanded rather than adding per-property branches.

The WebView contract follows Adobe names and asynchronous bridge semantics:

- remote property reads are `Promise<T>`
- queued property writes use synchronous setters and flush before later reads or calls
- native synchronous methods still return `Promise<T>` across RPC
- nullable native returns remain nullable

`activeLayers`, `activeChannels`, `bitsPerChannel`, `quickMaskMode`, `colorProfileName`, and `colorProfileType` become writable descriptors. All are Photoshop mutations and therefore host-modal; `pixelAspectRatio` retains its existing direct-write behavior.

### 2. `saveAs` is a local bound namespace, not a remote object

Native `document.saveAs` is an object containing `bmp`, `gif`, `jpg`, `png`, `psb`, and `psd`. It has no independent identity or lifecycle, so the WebView exposes a synchronous local namespace bound to its owning Document.

Each format method calls an explicit protocol method (`document.saveAs.<format>`) with the Document reference, encoded `UxpStorageFile`, options, and `asCopy`. The host resolves the storage reference through the existing UXP storage registry and calls the real native format method inside `executeAsModal`.

RemoteClass gains one protected invocation primitive for subclass-owned bound namespaces. It reuses the private reference, queued-write flush, recursive argument encoders, RPC call, and optional result decoder. This keeps all cross-bridge communication in RemoteClass and guarantees that a queued property write completes before `saveAs.*`.

Save option bags are recursively encoded. Nested `SolidColorInput` values in JPEG options are rebuilt as real host `SolidColor` values before the native call.

### 3. Result unions and value objects

`sampleColor` and `ColorSampler.color` use a `SampledColor` value kind. The host serializer distinguishes `NoColor` by `typename`; other values use the existing complete SolidColor snapshot. The WebView decoder returns either a frozen `{ typename: "NoColor" }` value or the local `SolidColor` value class. Neither receives a handle or disposal API.

`calculations` may return Document, Channel, or void. The shared result-kind vocabulary gains a reference-union form carrying the allowed remote types. RemoteClass decodes it by validating the returned reference discriminator and resolving through the existing registry. The host serializes the runtime result only when it matches one of the allowed types. This is a reusable protocol capability, not a Calculations-only ad hoc branch.

`splitChannels` is a Document snapshot collection. `mergeVisibleLayers` is corrected to `Promise<void>` per the current reference rather than decoding a nonexistent Layer reference. `paste` and layer-creation methods retain native nullability in their public return types.

### 4. Collection capability deepening

The snapshot collection factory currently hard-codes `getByName`, `add`, and `removeAll`. The new families need additional homogeneous collection calls, so collection registration becomes declarative:

- local metadata: `parent`, `typename`
- RPC methods: method name, mutating behavior (host-owned), and result shape (`void`, one reference, or a member collection)

The factory installs only the registered methods, recursively encodes arguments, calls the registered RPC with the snapshot owner, and decodes declared results through the same type registry. Existing collection registrations are migrated without changing their public behavior.

This keeps one collection module interface and avoids handwritten collection subclasses for every Photoshop family. Tests exercise behavior through the collection public interface rather than the registry's internal maps.

### 5. ColorSampler identity and behavior

ColorSampler exposes `typename`, `docId`, `parent`, `position`, `color`, `move`, and `remove`. `position` is a two-number value object; `color` is `SampledColor`; `parent` resolves to the owning Document.

Adobe exposes no persistent sampler id. The host therefore registers the concrete native object encountered in a snapshot and does not claim cross-snapshot `===` deduplication. A proxy remains stable for the lifetime of its reference; a fresh collection snapshot may contain fresh proxies, matching the existing Channel precedent. `move` and `remove` are modal.

ColorSamplers is a snapshot with synchronous `parent`, `length`, and array access plus async `add(position)` and `removeAll()`. `add` returns the new ColorSampler reference.

### 6. CountItem identity and behavior

CountItem exposes `itemIndex`, `groupIndex`, `typename`, `parent`, `position`, `move`, and `remove`. Its stable key is `(document id, groupIndex, itemIndex)` for the lifetime of that count item. `parent` decodes to a fresh CountItems snapshot owned by the same Document.

CountItems exposes `typename`, `parent`, array access, and all 11 documented methods. Reference-returning methods (`add`, `getAll`) decode through the registry; the remaining group operations return void. `setActiveColor` accepts any `SolidColorInput` and rebuilds a native color on the host. Every mutating operation is modal; `getAll` is a direct read.

### 7. LayerComp identity and behavior

LayerComp is a persistent RemoteObject keyed by `(docId, id)`. It exposes all documented scalars and writable properties, the parent Document reference, and `apply`, `duplicate`, `recapture`, `remove`, and `resetLayerComp`. Writes and methods are modal. `duplicate` returns a stable LayerComp reference; `recapture` recursively encodes optional Layer references.

LayerComps exposes `typename`, `parent`, array access, `add`, `getAllByName`, and `removeAll`. `add` returns one LayerComp and `getAllByName` returns a LayerComp snapshot.

### 8. Existing Document signature alignment

The canonical public signatures become the current Adobe forms:

- `close(saveDialogOptions?: SaveOptionsValue)`
- `resizeCanvas(width: number, height: number, anchor?: AnchorPositionValue)`
- `resizeImage(width?, height?, resolution?, resampleMethod?, amount?)`
- `trim(trimType: TrimTypeValue, top?, left?, bottom?, right?)`
- `mergeVisibleLayers(): Promise<void>`
- nullable returns for `paste`, `createLayer`, `createPixelLayer`, `createTextLayer`, `createLayerGroup`, and `groupLayers`

Deprecated overloads retain `DocumentCloseOptions` and `ResizeOptions`. The host normalizes those bags into Adobe positional arguments immediately before native invocation. Runtime behavior remains source-compatible while new declarations stop teaching an incorrect native shape.

## Host dispatch and modal policy

| Operation | Result | Modal policy |
| --- | --- | --- |
| Document scalar/enum reads, histogram, zoom | scalar | direct |
| Document collection/reference reads | snapshot/reference/value | direct |
| Document writable properties except pixelAspectRatio | void | modal |
| `saveAs.*`, mode/profile/geometry/generative methods | void | modal |
| `sampleColor` | SampledColor value | modal: Photoshop 26.10 rejects its internal colorSampler event outside modal scope |
| `calculations`, `splitChannels` | union ref / Document collection | modal |
| collection snapshots and `getAll*` | snapshots | direct read |
| collection/object add, remove, move, apply, write, recapture | ref/void | modal |

Every new family path validates method names, argument counts, required primitive ranges/shapes, reference types, and storage entry kinds before invoking the native target.

## Files

Primary changes are expected in:

- `src/shared/photoshop-api/photoshop-protocol.ts`
- `src/shared/photoshop-api/value-objects.ts`
- `src/webview/uxp-api/remote/remote-class.ts`
- `src/webview/photoshop-api/modules/photoshop/{document,registry,photoshop,types}.ts`
- focused WebView RemoteClass files for color sampler, count item, and layer comp
- `src/uxp/photoshop-api/modules/photoshop/{host,types}.ts`
- Photoshop public type export indexes
- static consistency, host contract, WebView contract, and colocated CDP tests

The three families remain inside the existing symmetric Photoshop module directories. Shared code contains only protocol/result/value definitions, never concrete Adobe implementations.

## Verification

### Static and contract

- exact Document documented-member manifest proves 65/66 and names `suspendHistory` as the only missing member
- descriptor/declaration/method-name/result-kind tables remain mutually consistent
- Document writes flush before reads, ordinary calls, and `saveAs.*`
- File references and nested SolidColor save options reconstruct native host objects
- `calculations` accepts and returns only Document/Channel/void
- sampler/count/comp references serialize, decode, and preserve the documented identity guarantees
- every collection method routes through its declared owner RPC and decodes its declared result
- all mutation paths enter modal execution; ordinary reads stay direct, while `sampleColor` follows the real host's modal requirement
- invalid keys, methods, references, arguments, and unavailable host members reject with bridge errors
- compatibility overload normalization produces the native positional argument arrays

### CDP

- create a uniquely named minimal fixture document and read safe Document facts including typename, mode, profile fields, bits, zoom, histogram where supported
- exercise `sampleColor` and empty/non-empty sampler/count/comp snapshots with version-aware diagnostics
- run reversible property/method mutations on owned fixtures and restore/close in `finally`
- create a temporary UXP File and verify one safe `saveAs` format, then delete the fixture file
- version-gated `generativeUpscale` is skipped unless the live host exposes it; it must still have contract coverage
- callback-bound `suspendHistory` is not claimed or skipped as implemented

### Gates

Run `pnpm typecheck`, `pnpm test:static`, `pnpm test:contract`, `pnpm test`, `pnpm build`, `pnpm exec tsc -p tsconfig.cdp-webview.json`, and `pnpm test:uxp`. A completed development unit also updates the coverage report from current-state evidence.

## Decision

Exact `Document.suspendHistory(callback, historyStateName)` is deferred, leaving Document at 65/66. A later implementation must first design a general bidirectional callback protocol covering callback registration/lifetime, re-entrancy, cancellation, remote error direction, teardown, and origin/capability enforcement.
