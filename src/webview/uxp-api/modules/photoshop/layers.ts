/**
 * `Layers` — a WebView-local collection view over a layer-id snapshot (ADR 0005 collection wrapper).
 *
 * A snapshot `{ owner, layerIds[] }` is captured once (via a `layers.snapshot` host RPC, decoded in
 * `photoshop.ts`); each id is resolved to a `===`-stable {@link PsLayer} through the Layer identity
 * cache. The collection is a real `Array` subclass so indexing/iteration/`length`/spread work
 * natively. Resolution is cheap and synchronous (the resolved `PsLayer` is itself a lazy proxy that
 * does no work until a property is awaited), so all elements are materialized up front.
 *
 * The snapshot is not auto-refreshed: if the underlying layer set changed, awaiting a stale
 * element's property rejects with `BridgeRemoteError`; the caller must re-await the owning property
 * (e.g. `doc.layers`) to obtain a fresh snapshot. Two collection instances are never `===` even
 * when they hold the same elements.
 */

import { PHOTOSHOP_MODULE_ID } from "@shared/uxp-api/photoshop-protocol.js";
import { REMOTE_REFERENCE_KIND } from "@shared/uxp-api/remote-protocol.js";
import type { RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { LayerCreateOptions, Layers, PsLayer } from "./types.js";

/** Synthesize the reference envelope for a snapshot layer id (type is always `Layer`). */
function layerReference(id: string): RemoteReference {
  return { kind: REMOTE_REFERENCE_KIND, type: "Layer", id };
}

/**
 * Build a {@link Layers} collection. `context` supplies the rpc client and the Layer identity cache
 * (via `getOrCreateLayer`); `ownerReference` is the Document/Layer the collection belongs to and is
 * passed to the host on `getByName`/`add`.
 */
export function createLayersCollection(
  context: PhotoshopContext,
  ownerReference: RemoteReference,
  layerIds: readonly string[]
): Layers {
  const resolved = layerIds.map((id) => context.getOrCreateLayer(layerReference(id)));

  class LayersCollection extends Array<PsLayer> implements Layers {
    async getByName(name: string): Promise<PsLayer | null> {
      const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "layers.getByName", [ownerReference, name]);
      const decoded = context.layerDecoder(raw);
      return (decoded as PsLayer | undefined) ?? null;
    }

    async add(options?: LayerCreateOptions): Promise<PsLayer> {
      const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "layers.add", [ownerReference, options]);
      const decoded = context.layerDecoder(raw);
      if (decoded === undefined) {
        throw new Error("layers.add did not return a layer reference.");
      }
      return decoded as PsLayer;
    }
  }

  // `Array`'s constructor treats a single numeric argument as a length; build via `from` to avoid it.
  const collection = LayersCollection.from(resolved) as LayersCollection;
  return collection;
}
