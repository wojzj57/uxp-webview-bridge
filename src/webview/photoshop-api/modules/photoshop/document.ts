/**
 * `WebviewPsDocument` — the WebView remote proxy for a Photoshop `Document`.
 *
 * Built as a class factory (`createDocumentClass`) so it can close over the shared namespace
 * context (identity caches + cross-object decoders). The static `properties`/`methods` descriptor
 * tables are the runtime source of truth; the `declare` members are the compile-time surface.
 * RFC-0007's static test locks `keyof properties ∪ keyof methods` against the `declare` key set.
 *
 * Document has many scalar properties, so — like XMPDateTime — they share a single keyed
 * `document.propertyGet`/`document.propertySet` RPC via the RemoteClass `remoteKey` mechanism.
 * The `mutating` flag on a descriptor is forwarded to the UXP host, which decides executeAsModal
 * semantics (ADR 0007); the WebView is unaware of modal execution.
 */

import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type {
  Channels,
  DocumentCloseOptions,
  Guides,
  HistoryStates,
  ImagingBounds,
  LayerCreateOptions,
  Layers,
  PathItems,
  PsDocument,
  PsHistoryState,
  PsLayer,
  PsSelection,
  ResizeOptions
} from "./types.js";

/** Read-only scalar Document properties (keyed shared get, no set). */
const DOCUMENT_READONLY_SCALARS = [
  "id",
  "saved",
  "name",
  "title",
  "path",
  "width",
  "height",
  "resolution",
  "cloudDocument",
  "cloudWorkAreaDirectory"
] as const;

/** Read/write scalar Document properties (keyed shared get + set). */
const DOCUMENT_WRITABLE_SCALARS = ["pixelAspectRatio"] as const;
const DOCUMENT_WRITABLE_REFS = ["activeHistoryState", "activeHistoryBrushSource"] as const;

/**
 * Build the Document property descriptor table. Exported (independently of the class factory) so the
 * registry static test can assert the declarative `refType`/`valueKind`/`collectionOf` typings stay
 * in sync with the shared `PHOTOSHOP_RESULT_KINDS` table without constructing an instance.
 */
export function createDocumentProperties(): Record<string, RemotePropertyDescriptor> {
  const { Layer, Channel, Selection, HistoryState } = PHOTOSHOP_REMOTE_TYPE;
  const properties: Record<string, RemotePropertyDescriptor> = {};
  for (const name of DOCUMENT_READONLY_SCALARS) {
    properties[name] = { writable: false, mutating: false, remoteKey: name };
  }
  for (const name of DOCUMENT_WRITABLE_SCALARS) {
    properties[name] = { writable: true, mutating: false, remoteKey: name };
  }
  // Collection & reference properties: declarative result typing resolved via the type registry.
  properties.layers = { writable: false, mutating: false, remoteKey: "layers", collectionOf: Layer };
  properties.activeLayers = { writable: false, mutating: false, remoteKey: "activeLayers", collectionOf: Layer };
  properties.artboards = { writable: false, mutating: false, remoteKey: "artboards", collectionOf: Layer };
  properties.backgroundLayer = { writable: false, mutating: false, remoteKey: "backgroundLayer", refType: Layer };
  properties.channels = { writable: false, mutating: false, remoteKey: "channels", collectionOf: Channel };
  properties.componentChannels = { writable: false, mutating: false, remoteKey: "componentChannels", collectionOf: Channel };
  properties.activeChannels = { writable: false, mutating: false, remoteKey: "activeChannels", collectionOf: Channel };
  properties.guides = { writable: false, mutating: false, remoteKey: "guides", collectionOf: PHOTOSHOP_REMOTE_TYPE.Guide };
  properties.pathItems = { writable: false, mutating: false, remoteKey: "pathItems", collectionOf: PHOTOSHOP_REMOTE_TYPE.PathItem };
  properties.selection = { writable: false, mutating: false, remoteKey: "selection", refType: Selection };
  properties.historyStates = {
    writable: false,
    mutating: false,
    remoteKey: "historyStates",
    collectionOf: HistoryState
  };
  for (const name of DOCUMENT_WRITABLE_REFS) {
    properties[name] = {
      writable: true,
      mutating: true,
      remoteKey: name,
      refType: HistoryState
    };
  }
  return properties;
}

/** Build the Document method descriptor table (see {@link createDocumentProperties}). */
export function createDocumentMethods(): Record<string, RemoteMethodDescriptor> {
  const { Document, Layer } = PHOTOSHOP_REMOTE_TYPE;
  return {
    duplicate: { mutating: true, refType: Document },
    close: { mutating: true },
    closeWithoutSaving: { mutating: true },
    flatten: { mutating: true },
    mergeVisibleLayers: { mutating: true, refType: Layer },
    revealAll: { mutating: true },
    rasterizeAllLayers: { mutating: true },
    crop: { mutating: true },
    resizeCanvas: { mutating: true },
    resizeImage: { mutating: true },
    trim: { mutating: true },
    rotate: { mutating: true },
    save: { mutating: true },
    createLayer: { mutating: true, refType: Layer },
    createPixelLayer: { mutating: true, refType: Layer },
    createTextLayer: { mutating: true, refType: Layer },
    createLayerGroup: { mutating: true, refType: Layer },
    groupLayers: { mutating: true, refType: Layer },
    duplicateLayers: { mutating: true, collectionOf: Layer },
    linkLayers: { mutating: true, collectionOf: Layer },
    paste: { mutating: true, refType: Layer }
  };
}

export function createDocumentClass(context: PhotoshopContext): {
  new (reference: RemoteReference): PsDocument;
} {
  const { rpc, registry } = context;

  const properties = createDocumentProperties();

  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(
      Object.keys(properties).map((name) => [name, "document.propertyGet"])
    ),
    propertySet: Object.fromEntries(
      [...DOCUMENT_WRITABLE_SCALARS, ...DOCUMENT_WRITABLE_REFS].map((name) => [name, "document.propertySet"])
    ),
    method: {
      duplicate: "document.duplicate",
      close: "document.close",
      closeWithoutSaving: "document.closeWithoutSaving",
      flatten: "document.flatten",
      mergeVisibleLayers: "document.mergeVisibleLayers",
      revealAll: "document.revealAll",
      rasterizeAllLayers: "document.rasterizeAllLayers",
      crop: "document.crop",
      resizeCanvas: "document.resizeCanvas",
      resizeImage: "document.resizeImage",
      trim: "document.trim",
      rotate: "document.rotate",
      save: "document.save",
      createLayer: "document.createLayer",
      createPixelLayer: "document.createPixelLayer",
      createTextLayer: "document.createTextLayer",
      createLayerGroup: "document.createLayerGroup",
      groupLayers: "document.groupLayers",
      duplicateLayers: "document.duplicateLayers",
      linkLayers: "document.linkLayers",
      paste: "document.paste"
    },
    batchGet: "document.batchGet",
    batchSet: "document.batchSet",
    dispose: "document.dispose"
  };

  const methods = createDocumentMethods();

  const config: RemoteClassConfig = {
    rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods,
    argEncoders: context.argEncoders,
    decodeContext: registry.decodeContext
  };

  class WebviewPsDocument extends RemoteClass implements PsDocument {
    declare readonly id: Promise<number>;
    declare readonly saved: Promise<boolean>;
    declare readonly name: Promise<string>;
    declare readonly title: Promise<string>;
    declare readonly path: Promise<string>;
    declare readonly width: Promise<number>;
    declare readonly height: Promise<number>;
    declare readonly resolution: Promise<number>;
    declare readonly cloudDocument: Promise<boolean>;
    declare readonly cloudWorkAreaDirectory: Promise<string>;
    declare pixelAspectRatio: Promise<number>;
    declare readonly layers: Promise<Layers>;
    declare readonly activeLayers: Promise<Layers>;
    declare readonly artboards: Promise<Layers>;
    declare readonly backgroundLayer: Promise<PsLayer | null>;
    declare readonly channels: Promise<Channels>;
    declare readonly componentChannels: Promise<Channels>;
    declare readonly activeChannels: Promise<Channels>;
    declare readonly guides: Promise<Guides>;
    declare readonly pathItems: Promise<PathItems>;
    declare readonly selection: Promise<PsSelection>;
    declare readonly historyStates: Promise<HistoryStates>;
    declare activeHistoryState: Promise<PsHistoryState>;
    declare activeHistoryBrushSource: Promise<PsHistoryState>;

    declare duplicate: (name?: string, mergeLayersOnly?: boolean) => Promise<PsDocument>;
    declare close: (options?: DocumentCloseOptions) => Promise<void>;
    declare closeWithoutSaving: () => Promise<void>;
    declare flatten: () => Promise<void>;
    declare mergeVisibleLayers: () => Promise<PsLayer>;
    declare revealAll: () => Promise<void>;
    declare rasterizeAllLayers: () => Promise<void>;
    declare crop: (bounds: ImagingBounds, angle?: number, width?: number, height?: number) => Promise<void>;
    declare resizeCanvas: (options?: ResizeOptions) => Promise<void>;
    declare resizeImage: (options?: ResizeOptions) => Promise<void>;
    declare trim: (trimType?: string, top?: boolean, left?: boolean, bottom?: boolean, right?: boolean) => Promise<void>;
    declare rotate: (angle: number) => Promise<void>;
    declare save: () => Promise<void>;
    declare createLayer: (options?: LayerCreateOptions) => Promise<PsLayer>;
    declare createPixelLayer: (options?: LayerCreateOptions) => Promise<PsLayer>;
    declare createTextLayer: (options?: LayerCreateOptions) => Promise<PsLayer>;
    declare createLayerGroup: (options?: LayerCreateOptions) => Promise<PsLayer>;
    declare groupLayers: (layers: readonly PsLayer[]) => Promise<PsLayer>;
    declare duplicateLayers: (layers: readonly PsLayer[], targetDocument?: PsDocument) => Promise<Layers>;
    declare linkLayers: (layers: readonly PsLayer[]) => Promise<Layers>;
    declare paste: (intoSelection?: boolean) => Promise<PsLayer>;

    constructor(source: RemoteReference | RemoteConstructionRequest) {
      super(config, source);
    }
  }

  return WebviewPsDocument as unknown as { new (reference: RemoteReference): PsDocument };
}
