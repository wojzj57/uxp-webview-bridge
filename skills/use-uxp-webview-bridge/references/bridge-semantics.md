# Bridge semantics

## Async properties and ordered writes

Remote reads return promises. Writable setters queue work because JavaScript setters cannot be async.

```ts
const document = await photoshop.app.activeDocument;
const layer = (await document.activeLayers)[0];
if (layer) {
  layer.name = "Processed";
  layer.opacity = 75;
  console.log(await layer.name); // flushes both writes before reading
}
```

Use `batchGet(["name", "opacity"])` for one request and `await batchSet({ name, opacity })` for explicit completion. `batchGet` returns an object keyed by exactly the requested property names; `batchSet` returns `Promise<void>`. Invalid/read-only keys fail locally with `TypeError`; host failures become remote errors. Collection/reference properties decode to the same public wrappers/objects as individual reads.

## Identity and collections

Documents and layers use stable remote references and normally preserve `===` identity. Persistent Photoshop DOM objects do not require routine disposal. Collection wrappers are local snapshots, resolve members lazily, and do not auto-refresh. Re-await the owning collection property after host mutations. Some Adobe objects without stable native ids, such as channels, may not deduplicate across snapshots.

## RemoteResult

Some calls return `RemoteResult<T>`, a promise-like value that can participate in the same queued-operation scheduler. Treat it as a promise in ordinary code: `const layer = await document.createLayer()`. Do not construct it yourself.

## Modal work

The UXP host wraps declared mutating Photoshop DOM calls in `executeAsModal`; ordinary DOM reads avoid modal execution. The current Imaging adapter runs all Imaging operations, including pixel/mask/selection reads, through modal execution. Use explicit `photoshop.core.executeAsModal` for a callback workflow and `document.suspendHistory` for document-scoped history suspension. Nested bridge calls inside those callbacks stay in the active modal session.

## Binary and resource lifecycle

Binary values use inline/base64 transport envelopes and are copied. Use `ArrayBuffer` or typed arrays, not transfer lists or streams. Close `fs` descriptors. Dispose `PsImageData`, XMP instances, iterators, and UXP storage entries as soon as practical; host TTL and runtime destruction are fallback cleanup, not the primary lifecycle.
