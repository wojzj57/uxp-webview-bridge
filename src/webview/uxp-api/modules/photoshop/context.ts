/**
 * Shared per-namespace wiring passed to the Document/Layer class factories and the Layers
 * collection factory. Document, Layer, and Layers reference each other cyclically and share the
 * WeakRef identity caches plus the envelope-to-instance decoders, so the wiring is resolved once in
 * `photoshop.ts` and injected here to keep the three files decoupled while still forming one closed
 * object graph (mirrors how the xmp module nests its classes in a single context).
 */

import type { RemoteReference, RemoteRpc, RemoteValueDecoder } from "@webview/uxp-api/remote/index.js";
import type { Layers, PsDocument, PsLayer } from "./types.js";

/**
 * Late-bound namespace context. The fields are functions/objects assembled in `photoshop.ts`;
 * using getters/functions avoids the initialization-order problem of the Document↔Layer cycle.
 */
export interface PhotoshopContext {
  readonly rpc: RemoteRpc;
  /** Resolve (create-or-reuse) a Document proxy from its reference envelope. */
  getOrCreateDocument(reference: RemoteReference): PsDocument;
  /** Resolve (create-or-reuse) a Layer proxy from its reference envelope. */
  getOrCreateLayer(reference: RemoteReference): PsLayer;
  /** Build a WebView-local Layers collection from an owner reference + a fetched id snapshot. */
  createLayers(ownerReference: RemoteReference, layerIds: readonly string[]): Layers;
  /** Decoder that maps a Document reference envelope in a return value to a Document proxy. */
  readonly documentDecoder: RemoteValueDecoder;
  /** Decoder that maps a Layer (or null) reference envelope to a Layer proxy. */
  readonly layerDecoder: RemoteValueDecoder;
  /** Decoder that maps a `layers.snapshot` envelope to a Layers collection. */
  readonly layersDecoder: RemoteValueDecoder;
  /** Decoder that maps an ImagingBounds transport to an ImagingBounds value object. */
  readonly boundsDecoder: RemoteValueDecoder;
}

/** Transport shape returned by a `*.propertyGet`/method that yields a layer collection snapshot. */
export interface LayersSnapshotTransport {
  readonly kind: "uxp.photoshop.layersSnapshot";
  readonly owner: RemoteReference;
  readonly layerIds: readonly string[];
}

export const LAYERS_SNAPSHOT_KIND = "uxp.photoshop.layersSnapshot";

export function isLayersSnapshotTransport(value: unknown): value is LayersSnapshotTransport {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === LAYERS_SNAPSHOT_KIND &&
    Array.isArray((value as { layerIds?: unknown }).layerIds)
  );
}
