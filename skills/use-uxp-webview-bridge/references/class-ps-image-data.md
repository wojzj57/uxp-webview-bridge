# `PsImageData`

Transient host resource returned by Photoshop Imaging.

Synchronous metadata snapshot: `width`, `height`, `components`, `componentSize` (`8 | 16 | 32`), `colorSpace`, `colorProfile`, `hasAlpha`, `pixelFormat`, `chunky`, `type`.

- `getData(options?: { chunky?: boolean; fullRange?: boolean })` returns `Uint8Array`, `Uint16Array`, or `Float32Array` based on component size.
- `dispose()` releases the host handle.

```ts
const { imageData } = await photoshop.imaging.getPixels({ documentID, layerID });
try {
  const pixels = await imageData.getData();
  // Process the copied buffer.
} finally {
  await imageData.dispose();
}
```

Never use after disposal. Large pixel buffers are serialized/copied and can be expensive.

`dispose()` is safe to repeat in the current host adapter and native disposal is best-effort. An unresolved handle is also removed after roughly 10 minutes of inactivity or at bridge teardown; explicit disposal remains preferred. `getData()` after disposal rejects as a remote error.
