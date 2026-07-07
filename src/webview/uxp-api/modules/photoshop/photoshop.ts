/**
 * The `photoshop` WebView namespace: builds the Document/Layer WeakRef identity caches, the
 * envelope-to-instance decoders that stitch the object graph together, the `Layers` collection
 * factory, the `app` entry surface, and attaches the transcribed constant tables. Exports a lazily
 * initialized singleton `photoshop`. All real Photoshop work runs on the UXP host (RFC-0006); this
 * side is proxies only. `src/webview` must never import `src/uxp` (AGENTS.md).
 */

import { getBridgeRpcClient } from "@webview/runtime.js";
import {
  AnchorPosition,
  BlendMode,
  ElementPlacement,
  FlipAxis,
  LayerKind,
  SaveOptions
} from "@shared/uxp-api/photoshop-constants.js";
import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/uxp-api/photoshop-protocol.js";
import {
  createIdentityCache,
  isRemoteReference,
  type IdentityCache,
  type RemoteReference,
  type RemoteRpc,
  type RemoteValueDecoder
} from "@webview/uxp-api/remote/index.js";
import { decodeImagingBounds } from "./bounds.js";
import { isLayersSnapshotTransport, type PhotoshopContext } from "./context.js";
import { createDocumentClass } from "./document.js";
import { createLayerClass } from "./layer.js";
import { createLayersCollection } from "./layers.js";
import type { Layers, OpenOptions, PhotoshopApp, PhotoshopNamespace, PsDocument, PsLayer } from "./types.js";

type PhotoshopRpc = RemoteRpc;

let defaultNamespace: PhotoshopNamespace | undefined;

export function createPhotoshopNamespace(rpc: PhotoshopRpc): PhotoshopNamespace {
  const context = createPhotoshopContext(rpc);

  const app: PhotoshopApp = {
    get activeDocument(): Promise<PsDocument> {
      return getActiveDocument(context);
    },
    get documents(): Promise<readonly PsDocument[]> {
      return getDocuments(context);
    },
    open(options?: OpenOptions): Promise<PsDocument> {
      return openDocument(context, options);
    }
  };

  return {
    app,
    LayerKind,
    BlendMode,
    AnchorPosition,
    ElementPlacement,
    SaveOptions,
    FlipAxis
  };
}

/**
 * Assemble the per-namespace context. The Document↔Layer cycle is broken by building the identity
 * caches and decoders first, then the two classes (which capture the context), then filling in the
 * `getOrCreate*`/`createLayers` closures that the decoders and collections rely on.
 */
function createPhotoshopContext(rpc: PhotoshopRpc): PhotoshopContext {
  const documentCache: IdentityCache<PsDocument> = createIdentityCache<PsDocument>();
  const layerCache: IdentityCache<PsLayer> = createIdentityCache<PsLayer>();

  const documentDecoder: RemoteValueDecoder = (value) =>
    isRemoteReference(value) && value.type === PHOTOSHOP_REMOTE_TYPE.Document
      ? context.getOrCreateDocument(value)
      : undefined;

  const layerDecoder: RemoteValueDecoder = (value) =>
    isRemoteReference(value) && value.type === PHOTOSHOP_REMOTE_TYPE.Layer
      ? context.getOrCreateLayer(value)
      : undefined;

  const layersDecoder: RemoteValueDecoder = (value) =>
    isLayersSnapshotTransport(value) ? context.createLayers(value.owner, value.layerIds) : undefined;

  const boundsDecoder: RemoteValueDecoder = (value) => decodeImagingBounds(value);

  const context: PhotoshopContext = {
    rpc,
    documentDecoder,
    layerDecoder,
    layersDecoder,
    boundsDecoder,
    getOrCreateDocument(reference: RemoteReference): PsDocument {
      return documentCache.getOrCreate(reference.id, () => new DocumentClass(reference));
    },
    getOrCreateLayer(reference: RemoteReference): PsLayer {
      return layerCache.getOrCreate(reference.id, () => new LayerClass(reference));
    },
    createLayers(ownerReference: RemoteReference, layerIds: readonly string[]): Layers {
      return createLayersCollection(context, ownerReference, layerIds);
    }
  };

  const DocumentClass = createDocumentClass(context);
  const LayerClass = createLayerClass(context);

  return context;
}

async function getActiveDocument(context: PhotoshopContext): Promise<PsDocument> {
  const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "app.activeDocument");
  const decoded = context.documentDecoder(raw);
  if (decoded === undefined) {
    throw new Error("app.activeDocument did not return a document reference.");
  }
  return decoded as PsDocument;
}

async function getDocuments(context: PhotoshopContext): Promise<readonly PsDocument[]> {
  const raw = await context.rpc.call<unknown[]>(PHOTOSHOP_MODULE_ID, "app.documents");
  return raw.map((entry) => {
    const decoded = context.documentDecoder(entry);
    if (decoded === undefined) {
      throw new Error("app.documents returned a non-document entry.");
    }
    return decoded as PsDocument;
  });
}

async function openDocument(context: PhotoshopContext, options?: OpenOptions): Promise<PsDocument> {
  const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "app.open", [options]);
  const decoded = context.documentDecoder(raw);
  if (decoded === undefined) {
    throw new Error("app.open did not return a document reference.");
  }
  return decoded as PsDocument;
}

export const photoshop: PhotoshopNamespace =
  defaultNamespace ??
  (defaultNamespace = createPhotoshopNamespace({
    call: <T>(module: string, method: string, args?: readonly unknown[]) =>
      getBridgeRpcClient().call<T>(module, method, args)
  }));
