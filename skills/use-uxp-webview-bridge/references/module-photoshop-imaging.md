# `photoshop.imaging` module

Requires both `photoshop` and `imaging` capabilities. Calls run in host modal execution.

- `getPixels(options) -> { imageData, sourceBounds, level }`
- `putPixels({ layerID, imageData, ... })`
- `getLayerMask(options)`, `putLayerMask(options)`
- `getSelection(options)`, `putSelection(options)`
- `createImageDataFromBuffer(typedArray, { width, height, components, colorSpace, ... }) -> PsImageData`
- `encodeImageData({ imageData, base64? }) -> number[] | string`

`getPixels` options are all optional: `documentID`, `layerID`, `sourceBounds { left, top, bottom, right }`, `targetSize { width?, height? }`, `colorSpace`, `colorProfile`, `componentSize: -1 | 8 | 16 | 32`, and `applyAlpha`. Its result contains `imageData`, `sourceBounds`, and pyramid `level`.

Mask reads require `layerID` and optionally take `documentID`, `kind: "user" | "vector"`, bounds, and target size. Selection reads optionally take document, bounds, and target size. Put calls require `PsImageData` plus their documented target identifiers and can take `replace`, target bounds, and `commandName`. Color-space/profile strings and layer-kind support remain native Photoshop concerns.

All Imaging operations run in host modal execution. Always dispose every `PsImageData` handle, including results and locally created image data.

Related: [PsImageData](class-ps-image-data.md), [bridge semantics](bridge-semantics.md), and [capabilities](capabilities-and-manifest.md).
