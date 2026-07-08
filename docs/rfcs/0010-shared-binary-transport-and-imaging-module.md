# RFC-0010: Shared binary transport layer + Photoshop imaging module

Status: ready-for-agent
Source: notes/photoshop-full-coverage-roadmap.md (§4, line C), ADR docs/adr/0011 (shared-binary-transport-and-imaging-handle)
Related: RFC-0004 (shared protocol & constants), RFC-0006 (photoshop uxp host adapter), RFC-0008 (registry foundation), ADR docs/adr/0004 (handle registry), docs/adr/0005 (object classification), docs/adr/0007 (executeAsModal), docs/adr/0009 (registries), docs/adr/0011, AGENTS.md

## Summary

Two layered deliverables. **(1) Promote binary transport to a shared, module-neutral layer** — extract fs's private `{ kind: "bytes", encoding, value }` envelope + base64 codec + inline threshold into `src/shared/uxp-api/binary-transport.ts`, and make `fs`, `crypto`, `fetch`, and the new imaging module all consume it (removing 3–4 duplicate codecs), with those modules' behavior and tests unchanged. **(2) Build `photoshop.imaging`** — `getPixels`/`putPixels`/`getLayerMask`/`putLayerMask`/`getSelection`/`putSelection`/`createImageDataFromBuffer`/`encodeImageData` — where `PhotoshopImageData` is a **resource handle** (handle registry + TTL + explicit `dispose`, ADR 0004/0011) whose pixel bytes cross via the shared binary envelope and whose metadata rides as a value object (ADR 0009). Deliverable (1) has blast radius beyond photoshop and is the riskier half; it lands first.

## Context & Problem

imaging is the first photoshop feature moving real binary (`getData()` → typed arrays; `createImageDataFromBuffer` ← typed array). AGENTS.md forbids relying on `postMessage` transfer, so binary needs a transport-safe envelope. That envelope already exists as fs-private code (`fsBytesToTransport`, `FS_INLINE_BYTES_LIMIT`, base64 codec) and is duplicated in spirit by crypto/fetch. Separately, `PhotoshopImageData` is not a value: it has `dispose()`, carries metadata, and is passed back into `put*`/`encodeImageData`, so it must round-trip and support cleanup — a resource handle, distinct from persistent DOM handles (which need no user disposal, ADR 0005). ADR 0011 decides to promote the binary layer and model imageData as a resource handle over it.

## Design

### Part 1 — shared binary transport (`src/shared/uxp-api/binary-transport.ts`)

- `interface BinaryTransportData { kind: "bytes"; encoding: "array" | "base64"; value: readonly number[] | string }` (the existing fs shape, de-prefixed).
- `bytesToTransport(bytes: Uint8Array, opts?): BinaryTransportData` — small (≤ threshold) → `array`, large → `base64`; threshold is a shared constant (moved from `FS_INLINE_BYTES_LIMIT`).
- `transportToBytes(data): Uint8Array`, plus `transportToArrayBuffer`, and a value coercion helper (`string | ArrayBuffer | ArrayBufferView → BinaryTransportData`) generalizing `fsValueToTransport`.
- Shared base64 encode/decode (moved from fs), the single copy.
- `isBinaryTransportData(x)` type guard.
- fs/crypto/fetch: replace their private helpers with imports from this layer. fs keeps its `text | bytes` union by composing the shared bytes shape with its text case; fs/crypto/fetch public behavior and existing tests are unchanged (regression is the success criterion).

### Part 2 — imaging module

**Namespace surface.** Extend `PhotoshopNamespace` with `imaging`:

```ts
imaging: {
  getPixels(options): Promise<GetPixelsResult>;          // { imageData: PsImageData, sourceBounds, level }
  putPixels(options): Promise<void>;
  getLayerMask(options): Promise<GetLayerMaskResult>;
  putLayerMask(options): Promise<void>;
  getSelection(options): Promise<GetSelectionResult>;
  putSelection(options): Promise<void>;
  createImageDataFromBuffer(buffer, options): Promise<PsImageData>;
  encodeImageData(options): Promise<number[] | string>;
}
```

Option/result types re-export Adobe's imaging types (`GetPixelsOptions`, `GetPixelsResult`, `PutPixelsOptions`, …) from `@shared-types/photoshop`, with `imageData` fields retyped to our `PsImageData` proxy.

**`PsImageData` resource handle.** A remote handle (its own type in the type registry, ADR 0009) with:
- read-only metadata accessors backed by a value-object snapshot captured at creation: `width`, `height`, `components`, `componentSize`, `colorSpace`, `colorProfile`, `pixelFormat`, `hasAlpha`, `chunky`, `type` (these are immutable for the lifetime of the native object, so they can be a value snapshot rather than per-access RPCs);
- `getData(options?): Promise<Uint8Array | Uint16Array | Float32Array>` — one RPC returning a `BinaryTransportData`; the WebView reconstructs the correct typed array from `componentSize` (8→Uint8, 16→Uint16, 32→Float32);
- `dispose(): Promise<void>` — releases the host handle (registry `dispose`), matching Adobe's `dispose` and the resource-handle contract.

**Host dispatch.** New `imaging.` branch in `host.ts` (or a dedicated `imaging` host file with its own handle registry instance, per ADR 0004's "one registry per module adapter"). On `getPixels`/`getLayerMask`/`getSelection`: call the real imaging API inside `executeAsModal` (these can enter modal per Adobe), register the returned `PhotoshopImageData` in the imageData handle registry (TTL-tracked), and return `{ imageData: <reference>, metadata: <value snapshot>, sourceBounds, level }`. On `getData`: resolve the handle, call `imageData.getData(options)`, envelope the bytes via `bytesToTransport`. On `putPixels`/`putLayerMask`/`putSelection`: resolve the imageData handle from its reference in the options, wrap the put in `executeAsModal`. On `createImageDataFromBuffer`: decode the incoming `BinaryTransportData` to a typed array, call the real API, register + return a handle. On `encodeImageData`: call through; a `base64: true` string result passes through as-is, a `number[]` result passes through as JSON (already transport-safe).

**Handle lifecycle.** imageData handles are TTL-pruned host-side (ADR 0004) and explicitly disposable; unlike Document/Layer they are transient and users should `dispose()` them. `putPixels`-style calls that receive an imageData reference resolve it through the registry; a disposed/expired handle raises `BridgeRemoteError`.

**Protocol.** Add imaging method names (`imaging.getPixels`, `imaging.putPixels`, `imaging.getLayerMask`, `imaging.putLayerMask`, `imaging.getSelection`, `imaging.putSelection`, `imaging.createImageDataFromBuffer`, `imaging.encodeImageData`, `imaging.imageData.getData`, `imaging.imageData.dispose`) and the imageData metadata value-object registration (ADR 0009 value registry) + the `PsImageData` type registration (type registry).

## Scope

**In scope**
- `src/shared/uxp-api/binary-transport.ts` + refactor of fs/crypto/fetch to consume it (behavior-preserving).
- imaging protocol method names + imageData metadata value-object + `PsImageData` type registration.
- WebView imaging namespace + `PsImageData` handle class (getData typed-array reconstruction, metadata accessors, dispose); re-export Adobe imaging option/result types (with `imageData` retyped to `PsImageData`).
- Host imaging dispatch with its own imageData handle registry (id space isolated per ADR 0004), executeAsModal on get*/put*, binary envelope on getData/createImageDataFromBuffer, TTL cleanup.
- Public export: `photoshop.imaging` from `uxp-webview-bridge/webview`.
- Tests per §Testing (including fs/crypto/fetch regression).

**Out of scope**
- Chunked/streamed binary transfer — the shared layer's inline-vs-base64 policy is sufficient for v1; chunking, if ever needed, is added once in the shared layer.
- `postMessage` transferables / SharedArrayBuffer (forbidden by AGENTS.md / ADR 0011).
- DOM classes (RFC-0008 foundation + later class batches) and batchPlay (RFC-0009).
- Any imaging option not present in Adobe's current `Imaging` interface.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| Shared binary | `BinaryTransportData` + `bytesToTransport`/`transportToBytes`/coercion + shared base64 + threshold; fs/crypto/fetch consume it |
| WebView namespace | add `imaging: { getPixels, putPixels, getLayerMask, putLayerMask, getSelection, putSelection, createImageDataFromBuffer, encodeImageData }` |
| New handle | `PsImageData` — metadata accessors, `getData(options?)`, `dispose()` |
| Types | re-export Adobe imaging option/result types with `imageData: PsImageData` |
| Protocol | add imaging + `imaging.imageData.*` method names; register imageData metadata value + `PsImageData` type |
| Lifecycle | imageData handle is transient: TTL-pruned host-side, user `dispose()` expected |

## Implementation plan

1. Extract `binary-transport.ts` from fs's private helpers (envelope, codec, threshold, coercion, guard).
2. Refactor fs/crypto/fetch to import from it; run their existing tests to confirm no behavior change.
3. Protocol: add imaging method names; register imageData metadata value-object + `PsImageData` type (building on RFC-0008's registries).
4. WebView: `PsImageData` handle class (typed-array reconstruction by `componentSize`, metadata snapshot accessors, `dispose`); imaging namespace methods; attach `imaging` to the namespace; re-export Adobe types retyped to `PsImageData`.
5. Host: imaging dispatch branch/file with its own handle registry; executeAsModal on get*/put*; `bytesToTransport`/decode on getData/createImageDataFromBuffer; encodeImageData passthrough; TTL cleanup wired into the existing prune path.
6. `pnpm typecheck` + `pnpm test:static`; then `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp`.

## Testing

- **Regression (no Photoshop):** existing fs/crypto/fetch unit + CDP tests pass unchanged after the binary-layer extraction — the success criterion for Part 1.
- **Shared binary unit:** round-trip `bytesToTransport`→`transportToBytes` for empty, small (< threshold → `array`), and large (> threshold → `base64`) buffers; base64 edge cases (padding) match the pre-extraction fs behavior.
- **WebView unit seam (stubbed rpc):** `getPixels` decodes a handle + metadata snapshot; `getData` reconstructs the correct typed array per `componentSize` (8/16/32); `createImageDataFromBuffer` envelopes the input buffer once; `dispose` issues `imaging.imageData.dispose`; a `put*` call encodes the imageData reference (not the bytes) into the RPC.
- **Static:** imaging method names accepted by the protocol assert; `PsImageData` registered in the type registry and its metadata `valueKind` registered (RFC-0008's no-dangling-name test covers it).
- **Co-located CDP (real Photoshop, `test:uxp`):** `photoshop.imaging-getpixels` (getPixels → getData → correct byte length `width*height*components*componentSize/8`), `photoshop.imaging-roundtrip` (createImageDataFromBuffer → putPixels → getPixels equals input), `photoshop.imaging-dispose` (dispose then getData raises `BridgeRemoteError`), `photoshop.imaging-encode-base64` (encodeImageData `base64:true` yields a base64 string).

## Dependencies

Part 2 depends on RFC-0008 (type + value registries) for `PsImageData` and its metadata value object. Part 1 (shared binary layer) depends on nothing and could land ahead of RFC-0008. RFC-0009 (batchPlay) is independent. Because Part 1 touches fs/crypto/fetch, coordinate its landing to keep those suites green.

## Open questions

- Whether imaging gets its own module directory (`modules/imaging`) with a separate host adapter + registry, or lives as a sub-branch of the existing photoshop module. Recommendation: **separate `imaging` module directory** (symmetric webview/uxp), because ADR 0004 wants one handle registry per module adapter and imageData's transient TTL lifecycle differs from the persistent Document/Layer registry — keeping id spaces and lifecycles isolated. The boundary checker's symmetry rule applies to the new directory pair.
