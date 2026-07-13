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

import type { RemoteReference } from "@shared/uxp-api/remote-protocol.js";

export const PHOTOSHOP_MODULE_ID = "photoshop-api/modules/photoshop";

/** Remote-reference `type` discriminators for the stateful DOM objects in this batch. */
export const PHOTOSHOP_REMOTE_TYPE = {
  Document: "Document",
  Layer: "Layer",
  Channel: "Channel",
  Selection: "Selection",
  HistoryState: "HistoryState",
  PathItem: "PathItem"
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
 * Stable envelope kind for a collection snapshot (ADR 0005 collection wrapper), generalizing the
 * former `uxp.photoshop.layersSnapshot`. `memberKind` is a remote type name (`"Layer"`, ...);
 * `owner` is the Document/Layer the collection belongs to; `memberIds` are the resolved member
 * reference ids captured at read time.
 */
export const PHOTOSHOP_SNAPSHOT_KIND = "uxp.photoshop.snapshot";

/** Transport shape the WebView decodes into a snapshot collection (both sides must agree). */
export interface PhotoshopSnapshotTransport {
  readonly kind: typeof PHOTOSHOP_SNAPSHOT_KIND;
  readonly memberKind: string;
  readonly owner: RemoteReference;
  readonly memberIds: readonly string[];
}

/** True when a raw transport value is a {@link PhotoshopSnapshotTransport} envelope. */
export function isPhotoshopSnapshotTransport(value: unknown): value is PhotoshopSnapshotTransport {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === PHOTOSHOP_SNAPSHOT_KIND &&
    typeof (value as { memberKind?: unknown }).memberKind === "string" &&
    Array.isArray((value as { memberIds?: unknown }).memberIds)
  );
}

/**
 * The transport-result classification of a single property read or method return.
 *
 * `scalar`  — pass the raw value through untouched (numbers, strings, booleans, enums).
 * `value`   — a value object; `valueKind` selects the value-object spec (ADR 0009).
 * `ref`     — a single remote reference (or null); `refType` is the referenced remote type name.
 * `collection` — a snapshot collection; `memberKind` is the member remote type name.
 *
 * `src/uxp` must not import `src/webview` descriptor objects (AGENTS.md), so the host derives
 * reference/collection/value dispatch from this shared table rather than the WebView descriptors; a
 * static test asserts the table stays in sync with the WebView descriptor declarations.
 */
export type PhotoshopResultKind =
  | { readonly kind: "scalar" }
  | { readonly kind: "value"; readonly valueKind: string }
  | { readonly kind: "ref"; readonly refType: string }
  | { readonly kind: "collection"; readonly memberKind: string };

const SCALAR: PhotoshopResultKind = { kind: "scalar" };
const ref = (refType: string): PhotoshopResultKind => ({ kind: "ref", refType });
const value = (valueKind: string): PhotoshopResultKind => ({ kind: "value", valueKind });
const collection = (memberKind: string): PhotoshopResultKind => ({ kind: "collection", memberKind });

/**
 * Per-remote-class result-kind tables. For each class, `properties` maps a property name to the
 * classification of its read result, and `methods` maps a method name to the classification of its
 * return value (methods returning `void`/scalar are omitted — the host defaults them to `scalar`).
 * Scalar properties (the shared keyed getters) are omitted and defaulted to `scalar` as well; only
 * non-scalar entries are listed so the table mirrors exactly the WebView descriptors' declarative
 * `refType`/`valueKind`/`collectionOf` fields.
 */
export interface PhotoshopClassResultKinds {
  readonly properties: Readonly<Record<string, PhotoshopResultKind>>;
  readonly methods: Readonly<Record<string, PhotoshopResultKind>>;
}

/** Result-kind tables keyed by remote type name. */
export const PHOTOSHOP_RESULT_KINDS: Readonly<Record<string, PhotoshopClassResultKinds>> = {
  [PHOTOSHOP_REMOTE_TYPE.Document]: {
    properties: {
      layers: collection(PHOTOSHOP_REMOTE_TYPE.Layer),
      activeLayers: collection(PHOTOSHOP_REMOTE_TYPE.Layer),
      artboards: collection(PHOTOSHOP_REMOTE_TYPE.Layer),
      backgroundLayer: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      channels: collection(PHOTOSHOP_REMOTE_TYPE.Channel),
      componentChannels: collection(PHOTOSHOP_REMOTE_TYPE.Channel),
      activeChannels: collection(PHOTOSHOP_REMOTE_TYPE.Channel),
      selection: ref(PHOTOSHOP_REMOTE_TYPE.Selection),
      historyStates: collection(PHOTOSHOP_REMOTE_TYPE.HistoryState),
      activeHistoryState: ref(PHOTOSHOP_REMOTE_TYPE.HistoryState),
      activeHistoryBrushSource: ref(PHOTOSHOP_REMOTE_TYPE.HistoryState)
    },
    methods: {
      duplicate: ref(PHOTOSHOP_REMOTE_TYPE.Document),
      mergeVisibleLayers: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      createLayer: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      createPixelLayer: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      createTextLayer: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      createLayerGroup: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      groupLayers: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      paste: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      duplicateLayers: collection(PHOTOSHOP_REMOTE_TYPE.Layer),
      linkLayers: collection(PHOTOSHOP_REMOTE_TYPE.Layer)
    }
  },
  [PHOTOSHOP_REMOTE_TYPE.Layer]: {
    properties: {
      bounds: value("ImagingBounds"),
      boundsNoEffects: value("ImagingBounds"),
      document: ref(PHOTOSHOP_REMOTE_TYPE.Document),
      parent: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      linkedLayers: collection(PHOTOSHOP_REMOTE_TYPE.Layer)
    },
    methods: {
      duplicate: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      merge: ref(PHOTOSHOP_REMOTE_TYPE.Layer),
      link: collection(PHOTOSHOP_REMOTE_TYPE.Layer)
    }
  },
  [PHOTOSHOP_REMOTE_TYPE.Channel]: {
    properties: {
      // `histogram` is a raw `number[]` — a scalar, so it is omitted (defaults to scalar).
      color: value("SolidColor"),
      parent: ref(PHOTOSHOP_REMOTE_TYPE.Document)
    },
    // duplicate/merge/remove all return void → scalar (omitted).
    methods: {}
  },
  [PHOTOSHOP_REMOTE_TYPE.Selection]: {
    properties: {
      parent: ref(PHOTOSHOP_REMOTE_TYPE.Document),
      bounds: value("ImagingBounds")
    },
    methods: {
      makeWorkPath: ref(PHOTOSHOP_REMOTE_TYPE.PathItem)
    }
  },
  [PHOTOSHOP_REMOTE_TYPE.HistoryState]: {
    properties: {
      parent: ref(PHOTOSHOP_REMOTE_TYPE.Document)
    },
    methods: {}
  },
  [PHOTOSHOP_REMOTE_TYPE.PathItem]: {
    properties: {},
    methods: {}
  }
};

/** Resolve the result kind of a class property read (defaults to `scalar`). */
export function photoshopPropertyResultKind(remoteType: string, property: string): PhotoshopResultKind {
  return PHOTOSHOP_RESULT_KINDS[remoteType]?.properties[property] ?? SCALAR;
}

/** Resolve the result kind of a class method return (defaults to `scalar`, which covers void). */
export function photoshopMethodResultKind(remoteType: string, method: string): PhotoshopResultKind {
  return PHOTOSHOP_RESULT_KINDS[remoteType]?.methods[method] ?? SCALAR;
}

/**
 * Complete set of RPC method names crossing the `photoshop` bridge.
 *
 * Grouped by owner for readability; the union is the source of truth for dispatch validation.
 * - `app.*`   — namespace entry points.
 * - `document.*` / `layer.*` — shared property get/set (keyed by property name via `remoteKey`),
 *   per-method calls, `batchGet`/`batchSet`, and `dispose`.
 * - `layers.*` — collection snapshot / lookup / mutation.
 * - `action.*` — low-level action operations (verbatim descriptors/references, no bridge-reference mapping).
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
  "layers.add",

  // Channel: shared property accessors + lifecycle
  "channel.propertyGet",
  "channel.propertySet",
  "channel.batchGet",
  "channel.batchSet",
  "channel.dispose",
  // Channel: methods (all mutating)
  "channel.duplicate",
  "channel.merge",
  "channel.remove",

  // Channels collection (WebView-local wrapper; these RPCs feed/mutate it)
  "channels.snapshot",
  "channels.getByName",
  "channels.add",

  // Selection: shared property accessors + methods
  "selection.propertyGet",
  "selection.batchGet",
  "selection.batchSet",
  "selection.dispose",
  "selection.contract",
  "selection.deselect",
  "selection.expand",
  "selection.feather",
  "selection.grow",
  "selection.inverse",
  "selection.load",
  "selection.makeWorkPath",
  "selection.selectAll",
  "selection.selectRectangle",
  "selection.selectEllipse",
  "selection.selectPolygon",
  "selection.selectRow",
  "selection.selectColumn",
  "selection.save",
  "selection.saveTo",
  "selection.selectBorder",
  "selection.smooth",
  "selection.translateBoundary",
  "selection.resizeBoundary",
  "selection.rotateBoundary",

  // HistoryState + collection
  "historyState.propertyGet",
  "historyState.batchGet",
  "historyState.batchSet",
  "historyState.dispose",
  "historyStates.snapshot",
  "historyStates.getByName",

  // PathItem placeholder; batch 2 fills its public surface.
  "pathItem.dispose",

  // action namespace: opaque native descriptors/references (never bridge-reference decoded)
  "action.batchPlay",
  "action.batchPlaySync",
  "action.getIDFromString",
  "action.recordAction",
  "action.validateReference"
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
