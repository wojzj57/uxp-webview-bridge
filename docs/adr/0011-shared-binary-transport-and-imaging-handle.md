# Shared binary transport layer, with imaging PhotoshopImageData as a resource handle

Full ps-reference coverage was expanded to include `require("photoshop").imaging`, whose payload is bulk binary pixel data (`getData()` returns `Uint8Array | Uint16Array | Float32Array`; `createImageDataFromBuffer` takes a typed array). This is the first photoshop feature that must move real binary across the bridge, and AGENTS.md requires binary to use a transport-safe envelope rather than `postMessage` transfer semantics.

Two facts shaped the decision:

1. **A binary envelope already exists but is fs-private.** `src/shared/uxp-api/fs-protocol.ts` implements `{ kind: "bytes", encoding: "array" | "base64", value }` with an inline-size threshold (`FS_INLINE_BYTES_LIMIT`, small → number array, large → base64) and a full base64 codec — all named `fs*` and scoped to fs. `crypto` and `fetch` also move binary independently. imaging would be a fourth duplicate.
2. **`PhotoshopImageData` is a stateful resource handle, not a value.** It has `dispose()`, carries metadata (`width`/`height`/`components`/`componentSize`/`colorSpace`/`colorProfile`/`pixelFormat`/`hasAlpha`/`chunky`), and is passed *back in* to `putPixels`/`putLayerMask`/`putSelection`/`encodeImageData`. It must round-trip and support explicit + timed cleanup — exactly the resource-handle contract in the spec, unlike persistent DOM objects (Document/Layer) which need no user disposal (ADR 0005).

We therefore decide two layered things:

- **Promote the binary envelope to a shared, module-neutral layer.** Extract `src/shared/uxp-api/binary-transport.ts` with a generic `BinaryTransportData` + `bytesToTransport` / `transportToBytes` (+ shared inline threshold and base64 codec). `fs`, `crypto`, `fetch`, and `imaging` all consume it; the fs-private helpers become thin re-exports or are replaced. This removes 3–4 duplicate base64 codecs.
- **Model `PhotoshopImageData` as a resource handle over that binary layer.** It lives in the handle registry (ADR 0004) with a TTL and explicit `dispose`, distinct from persistent DOM handles. Its pixel bytes cross via the shared binary envelope; its metadata rides as a value object (ADR 0009 value registry). A handle may originate host-side (`getPixels`/`getLayerMask`/`getSelection` return one) or from a WebView buffer (`createImageDataFromBuffer` uploads bytes → host creates the native object → returns a handle).

## Considered Options

- **Promote to shared binary layer + imaging handle (chosen):** one binary codec for the whole bridge; imaging reuses proven fs machinery; `PhotoshopImageData` gets correct resource-handle lifecycle. Cost: blast radius beyond photoshop — refactoring fs/crypto/fetch (already-working modules) to consume the shared layer.
- **imaging-private binary envelope (self-contained):** no risk to fs/crypto/fetch; imaging carries its own copy. Rejected: a fourth duplicate base64 codec, against the "generalize the foundation" basis of ADR 0009; drift across four copies.
- **Rely on `postMessage` transferables / SharedArrayBuffer for pixels:** zero-copy, fast. Rejected: AGENTS.md forbids depending on transfer semantics; not portable across the WebView↔UXP channel; SAB availability is not guaranteed.
- **Treat `PhotoshopImageData` as a value object (inline all bytes every crossing):** simplest model. Rejected: it has `dispose` and is re-submitted to put* calls; treating it as a value would re-upload megabytes on every use and lose the native object identity the put* APIs require.

## Consequences

- Refactoring fs/crypto/fetch to the shared binary layer is in scope for the imaging work and must keep their existing behavior/tests green — a pure internal consolidation with an expanded blast radius acknowledged up front.
- `PhotoshopImageData` handles require explicit `dispose()` and host-side TTL cleanup; unlike Document/Layer, they are *not* persistent and users are expected to release them (mirrors Adobe's own `dispose` guidance for memory).
- imaging's own `encodeImageData({ base64: true })` returns base64 already; the bridge passes such string results through without re-enveloping, while raw typed-array results (`getData`) use the shared binary envelope.
- Large pixel buffers can exceed the inline threshold and travel as base64; the shared layer owns the small-array-vs-base64 policy. Chunking, if ever needed, is added once in the shared layer, benefiting all consumers.
- imaging depends on the shared binary layer and on the ADR 0009 value/handle registries; its module can start once the binary layer is promoted, independent of the DOM class batches.
- `imaging` sits under the photoshop namespace as its own sub-module (`photoshop.imaging`), separate from the DOM class surface and from batchPlay (ADR 0010).
