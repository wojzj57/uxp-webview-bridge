[简体中文](./zh/photoshop.md)

# Photoshop guide

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

The `photoshop` WebView namespace exposes implemented Photoshop DOM, Action, Core, Imaging, helper, and constant-table surfaces. All native work executes in the UXP host. Four independent leaves authorize the remote surfaces:

| Leaf capability | Surface |
| --- | --- |
| `photoshop.dom` | Main Photoshop adapter methods other than the three public batchPlay methods, including DOM remote objects |
| `photoshop.core` | `photoshop.core`, including modal-session Core RPC methods |
| `photoshop.imaging` | `photoshop.imaging` and image-data handle methods |
| `photoshop.batchPlay` | `photoshop.action.batchPlay`, `photoshop.action.batchPlaySync`, and `photoshop.app.batchPlay` |

All four default to denied, and enabling one does not enable another. `photoshop.all` expands to the four leaves known to the installed package version and may grow when an upgrade adds another Photoshop leaf. Synchronous constants and WebView-local constructors do not cross the bridge and need no capability.

Use the exported TypeScript types under [`src/webview/photoshop-api`](../src/webview/photoshop-api) as the exhaustive current interface. This guide describes the remote-object model and safe representative flows, not every Adobe member.

## Read the active document safely

An active document may be unavailable. This read-only example does not create, modify, or close a user's document.

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const document = await photoshop.app.activeDocument.catch(() => null);

if (!document) {
  console.log("Open a document to inspect Photoshop state.");
} else {
  const layers = await document.layers;
  const firstLayer = layers[0];
  console.log({
    documentName: await document.name,
    layerCount: layers.length,
    firstLayerName: firstLayer ? await firstLayer.name : undefined
  });
}
```

`document.layers` returns a point-in-time collection wrapper. Reading it again produces another wrapper; it does not auto-refresh. Where a stable Photoshop domain id exists, members representing the same live object retain stable identity across snapshots.

## Understand values and remote objects

| Shape | Semantics |
| --- | --- |
| Remote object | Represents live host state. Property reads are Promise-valued and methods cross the bridge. |
| Collection wrapper | WebView-local snapshot of member ids; indexing lazily resolves a member. It is not a live collection. |
| Value object | Plain serialized data such as bounds or histogram; it has no remote lifetime or methods. |
| Constant/helper | Synchronous WebView-local table or builder such as `photoshop.constants`, color helpers, or path builders. |
| Resource handle | Transient host resource such as `PsImageData`; call `dispose()` in `finally`. |

Remote failures surface as `BridgeRemoteError` with remote metadata and an `operationId`. A capability denial has code `ERR_BRIDGE_CAPABILITY_DISABLED`, remote name `BridgeCapabilityError`, and exact `capability`, `module`, and `method` fields. Action/batchPlay descriptors remain caller-owned opaque Photoshop JSON; native ids inside them are Photoshop ids, not bridge remote-reference ids.

## Queued writes and modal execution

Remote property setters cannot return an awaitable Promise. A write is queued, and the next remote read or method call flushes earlier writes in order. The following example creates disposable state and closes it without saving:

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const testDocument = await photoshop.app.createDocument({
  name: "Bridge lifecycle example",
  width: 16,
  height: 16
});

if (!testDocument) {
  throw new Error("Photoshop did not create the test document.");
}

try {
  const layer = await testDocument.createLayer({ name: "Initial name" });
  if (layer) {
    await layer.batchSet({ name: "Updated name" });
    console.log(await layer.name);
  }
} finally {
  await testDocument.closeWithoutSaving();
}
```

`batchSet()` validates the complete input, snapshots it at invocation time, and returns a Promise that resolves after the host applies the write. Use it when explicit completion matters. Direct property assignment still queues a write that is flushed before the next remote read or method call.

The UXP adapters enter Photoshop's modal execution seam where they classify an operation as mutating. WebView callers should not add a second WebView-side `executeAsModal` wrapper. Reads avoid modal execution where the adapter classifies them as non-mutating.

## Imaging handles

Pixel-producing operations return `PsImageData`, a transient resource handle. Its metadata is available locally, while `getData()` and `dispose()` cross the bridge. Always dispose it, including when reading or encoding fails.

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const document = await photoshop.app.activeDocument.catch(() => null);
if (document) {
  const { imageData } = await photoshop.imaging.getPixels({
    documentID: await document.id
  });

  try {
    const pixels = await imageData.getData({ chunky: true });
    console.log({ width: imageData.width, height: imageData.height, values: pixels.length });
  } finally {
    await imageData.dispose();
  }
}
```

Do not retain image handles until host timeout cleanup. A disposed handle rejects later `getData()` calls.

## Interface notes

- `photoshop.app`, `photoshop.action`, `photoshop.core`, and `photoshop.imaging` are direct namespace families.
- `photoshop.constants` and exported helpers are synchronous and do not cross the bridge.
- Plain value objects are snapshots, not live remote objects.
- Collection membership can become stale if Photoshop state changes after the snapshot.
- Use `batchGet` when you need several remote properties together; await `batchSet` for grouped writes with explicit host completion.
- Mutating examples must own disposable test state. Never use the user's current document as scratch state.
- Imaging resources require deterministic disposal even though the host also has timeout cleanup.
