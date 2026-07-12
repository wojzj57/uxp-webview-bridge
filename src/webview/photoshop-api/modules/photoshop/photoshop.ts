/**
 * The `photoshop` WebView namespace: builds the type/value/collection registry (ADR 0009), the
 * Document/Layer classes that self-register into it, the `app` entry surface, and attaches the
 * transcribed constant tables. Exports a lazily initialized singleton `photoshop`. All real
 * Photoshop work runs on the UXP host (RFC-0006); this side is proxies only. `src/webview` must
 * never import `src/uxp` (AGENTS.md).
 */

import { getBridgeRpcClient } from "@webview/runtime.js";
import {
  AnchorPosition,
  BlendMode,
  ChannelType,
  ElementPlacement,
  FlipAxis,
  LayerKind,
  SaveOptions
} from "@shared/photoshop-api/photoshop-constants.js";
import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import type { RemoteRpc } from "@webview/uxp-api/remote/index.js";
import { createImagingNamespace } from "../imaging/imaging.js";
import { createChannelClass } from "./channel.js";
import type { PhotoshopContext } from "./context.js";
import { createDocumentClass } from "./document.js";
import { createLayerClass } from "./layer.js";
import { createPhotoshopTypeRegistry } from "./registry.js";
import type {
  ActionDescriptor,
  BatchPlayCommandOptions,
  OpenOptions,
  PhotoshopActions,
  PhotoshopApp,
  PhotoshopNamespace,
  PsDocument
} from "./types.js";

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

  const action: PhotoshopActions = {
    batchPlay(
      commands: readonly ActionDescriptor[],
      options?: BatchPlayCommandOptions
    ): Promise<ActionDescriptor[]> {
      return batchPlay(context, commands, options);
    }
  };

  return {
    app,
    action,
    imaging: createImagingNamespace(rpc),
    LayerKind,
    BlendMode,
    AnchorPosition,
    ElementPlacement,
    SaveOptions,
    FlipAxis,
    ChannelType
  };
}

/**
 * Assemble the per-namespace context. The type registry is created empty, then Document and Layer
 * register their factories into it; the Document↔Layer cycle is fine because the registry's decode
 * resolver looks factories up lazily at decode time (ADR 0009), not at construction time. `Layer`
 * collections declare their `getByName`/`add` RPC capabilities so every `Layers` snapshot behaves
 * identically regardless of which property/method produced it.
 */
function createPhotoshopContext(rpc: PhotoshopRpc): PhotoshopContext {
  const registry = createPhotoshopTypeRegistry(rpc);
  const context: PhotoshopContext = { rpc, registry };

  const DocumentClass = createDocumentClass(context);
  const LayerClass = createLayerClass(context);
  const ChannelClass = createChannelClass(context);

  registry.register(PHOTOSHOP_REMOTE_TYPE.Document, (reference) => new DocumentClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, (reference) => new LayerClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Channel, (reference) => new ChannelClass(reference));
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Layer, {
    getByName: "layers.getByName",
    add: "layers.add"
  });
  // Channels support name lookup but not `add` in this batch (Channels.add is out of scope).
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Channel, {
    getByName: "channels.getByName"
  });

  return context;
}

function decodeDocument(context: PhotoshopContext, raw: unknown): PsDocument {
  const decoded = context.registry.decodeContext.decodeRef(PHOTOSHOP_REMOTE_TYPE.Document, raw);
  if (decoded == null) {
    throw new Error("Expected a document reference.");
  }
  return decoded as PsDocument;
}

async function getActiveDocument(context: PhotoshopContext): Promise<PsDocument> {
  const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "app.activeDocument");
  return decodeDocument(context, raw);
}

async function getDocuments(context: PhotoshopContext): Promise<readonly PsDocument[]> {
  const raw = await context.rpc.call<unknown[]>(PHOTOSHOP_MODULE_ID, "app.documents");
  return raw.map((entry) => decodeDocument(context, entry));
}

async function openDocument(context: PhotoshopContext, options?: OpenOptions): Promise<PsDocument> {
  const raw = await context.rpc.call<unknown>(PHOTOSHOP_MODULE_ID, "app.open", [options]);
  return decodeDocument(context, raw);
}

/**
 * Verbatim `batchPlay` passthrough (ADR 0010): one RPC carrying `[commands, options]` as plain JSON;
 * the host's result descriptor array is returned unchanged. No arg-encoding and no reference decode
 * happen here — descriptors are opaque and any native `_ref`/`_id` inside them is the caller's.
 */
function batchPlay(
  context: PhotoshopContext,
  commands: readonly ActionDescriptor[],
  options?: BatchPlayCommandOptions
): Promise<ActionDescriptor[]> {
  return context.rpc.call<ActionDescriptor[]>(PHOTOSHOP_MODULE_ID, "action.batchPlay", [commands, options]);
}

export const photoshop: PhotoshopNamespace =
  defaultNamespace ??
  (defaultNamespace = createPhotoshopNamespace({
    call: <T>(module: string, method: string, args?: readonly unknown[]) =>
      getBridgeRpcClient().call<T>(module, method, args)
  }));
