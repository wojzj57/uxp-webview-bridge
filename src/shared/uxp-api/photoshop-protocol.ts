/**
 * Runtime-neutral protocol for the `photoshop` bridge module: module id, the full RPC method-name
 * vocabulary, remote-reference `type` constants, and the `ImagingBounds` value-object shape.
 *
 * Both bridge sides import this file; it carries no concrete `photoshop` implementation. Document
 * and Layer are stateful remote objects (RemoteClass on the WebView side, handle registry on the
 * UXP side); their many scalar properties share a single `propertyGet`/`propertySet` RPC that
 * dispatches on a property-name key (the RemoteClass `remoteKey` mechanism), mirroring XMPDateTime.
 *
 * See docs/adr/0002 (remote-class-descriptor-table), docs/adr/0003 (property-write-and-batch),
 * docs/adr/0004 (shared-remote-reference-and-handle-registry), docs/adr/0007 (execute-as-modal).
 */

export const PHOTOSHOP_MODULE_ID = "uxp-api/modules/photoshop";

/** Remote-reference `type` discriminators for the stateful DOM objects in this batch. */
export const PHOTOSHOP_REMOTE_TYPE = {
  Document: "Document",
  Layer: "Layer"
} as const;
export type PhotoshopRemoteType = (typeof PHOTOSHOP_REMOTE_TYPE)[keyof typeof PHOTOSHOP_REMOTE_TYPE];

/**
 * Canonical field list of an {@link ImagingBounds} value object. The UXP host serializer copies
 * exactly these fields; the WebView decoder reconstructs a plain object from exactly these fields.
 * Sharing the list keeps the two sides from drifting.
 */
export const IMAGING_BOUNDS_FIELDS = ["left", "right", "top", "bottom", "width", "height"] as const;
export type ImagingBoundsField = (typeof IMAGING_BOUNDS_FIELDS)[number];

/** Transport (and value) shape of an ImagingBounds. Plain JSON, no handle, no methods. */
export interface ImagingBoundsTransport {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Complete set of RPC method names crossing the `photoshop` bridge.
 *
 * Grouped by owner for readability; the union is the source of truth for dispatch validation.
 * - `app.*`   — namespace entry points.
 * - `document.*` / `layer.*` — shared property get/set (keyed by property name via `remoteKey`),
 *   per-method calls, `batchGet`/`batchSet`, and `dispose`.
 * - `layers.*` — collection snapshot / lookup / mutation.
 */
export const PHOTOSHOP_METHOD_NAMES = [
  // app namespace
  "app.activeDocument",
  "app.documents",
  "app.open",

  // Document: shared property accessors + lifecycle
  "document.propertyGet",
  "document.propertySet",
  "document.batchGet",
  "document.batchSet",
  "document.dispose",
  // Document: methods
  "document.duplicate",
  "document.close",
  "document.closeWithoutSaving",
  "document.flatten",
  "document.mergeVisibleLayers",
  "document.revealAll",
  "document.rasterizeAllLayers",
  "document.crop",
  "document.resizeCanvas",
  "document.resizeImage",
  "document.trim",
  "document.rotate",
  "document.save",
  "document.createLayer",
  "document.createPixelLayer",
  "document.createTextLayer",
  "document.createLayerGroup",
  "document.groupLayers",
  "document.duplicateLayers",
  "document.linkLayers",
  "document.paste",

  // Layer: shared property accessors + lifecycle
  "layer.propertyGet",
  "layer.propertySet",
  "layer.batchGet",
  "layer.batchSet",
  "layer.dispose",
  // Layer: methods
  "layer.delete",
  "layer.duplicate",
  "layer.link",
  "layer.unlink",
  "layer.move",
  "layer.translate",
  "layer.flip",
  "layer.scale",
  "layer.rotate",
  "layer.merge",
  "layer.rasterize",

  // Layers collection (WebView-local wrapper; these RPCs feed/mutate it)
  "layers.snapshot",
  "layers.getByName",
  "layers.add"
] as const;

export type PhotoshopProtocolMethodName = (typeof PHOTOSHOP_METHOD_NAMES)[number];

const PHOTOSHOP_METHOD_SET = new Set<string>(PHOTOSHOP_METHOD_NAMES);

export function isPhotoshopProtocolMethodName(method: string): method is PhotoshopProtocolMethodName {
  return PHOTOSHOP_METHOD_SET.has(method);
}

export function assertPhotoshopProtocolMethodName(
  method: string
): asserts method is PhotoshopProtocolMethodName {
  if (!isPhotoshopProtocolMethodName(method)) {
    throw new Error(`Unsupported photoshop method: ${method}`);
  }
}
