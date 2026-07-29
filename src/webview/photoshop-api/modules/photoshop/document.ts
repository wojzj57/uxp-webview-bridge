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
import { SAMPLED_COLOR_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  REMOTE_INVOKE,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import { requirePhotoshopCallbackOwner, type PhotoshopContext } from "./context.js";
import type {
  CoreCancellationEvent,
  ExecutionHostControl,
  ReportProgressOptions,
  ResumeHistoryOptions
} from "../core/types.js";
import type {
  DocumentSaveAs,
  PsDocument,
  SuspendHistoryContext,
} from "./types.js";

/** Read-only scalar Document properties (keyed shared get, no set). */
const DOCUMENT_READONLY_SCALARS = [
  "id",
  "typename",
  "saved",
  "name",
  "title",
  "path",
  "width",
  "height",
  "resolution",
  "cloudDocument",
  "cloudWorkAreaDirectory",
  "histogram",
  "mode",
  "zoom"
] as const;

/** Read/write scalar Document properties (keyed shared get + set). */
const DOCUMENT_WRITABLE_SCALARS = [
  "pixelAspectRatio",
  "quickMaskMode",
  "bitsPerChannel",
  "colorProfileName",
  "colorProfileType"
] as const;
const DOCUMENT_WRITABLE_REFS = ["activeHistoryState", "activeHistoryBrushSource"] as const;
const DOCUMENT_WRITABLE_COLLECTIONS = ["activeLayers", "activeChannels"] as const;

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
  properties.activeLayers = { writable: true, mutating: true, remoteKey: "activeLayers", collectionOf: Layer };
  properties.artboards = { writable: false, mutating: false, remoteKey: "artboards", collectionOf: Layer };
  properties.backgroundLayer = { writable: false, mutating: false, remoteKey: "backgroundLayer", refType: Layer };
  properties.channels = { writable: false, mutating: false, remoteKey: "channels", collectionOf: Channel };
  properties.componentChannels = { writable: false, mutating: false, remoteKey: "componentChannels", collectionOf: Channel };
  properties.activeChannels = { writable: true, mutating: true, remoteKey: "activeChannels", collectionOf: Channel };
  properties.compositeChannels = { writable: false, mutating: false, remoteKey: "compositeChannels", collectionOf: Channel };
  properties.guides = { writable: false, mutating: false, remoteKey: "guides", collectionOf: PHOTOSHOP_REMOTE_TYPE.Guide };
  properties.pathItems = { writable: false, mutating: false, remoteKey: "pathItems", collectionOf: PHOTOSHOP_REMOTE_TYPE.PathItem };
  properties.colorSamplers = { writable: false, mutating: false, remoteKey: "colorSamplers", collectionOf: PHOTOSHOP_REMOTE_TYPE.ColorSampler };
  properties.countItems = { writable: false, mutating: false, remoteKey: "countItems", collectionOf: PHOTOSHOP_REMOTE_TYPE.CountItem };
  properties.layerComps = { writable: false, mutating: false, remoteKey: "layerComps", collectionOf: PHOTOSHOP_REMOTE_TYPE.LayerComp };
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
    mergeVisibleLayers: { mutating: true },
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
    paste: { mutating: true, refType: Layer },
    calculations: { mutating: true, refTypes: [Document, PHOTOSHOP_REMOTE_TYPE.Channel] },
    changeMode: { mutating: true },
    convertProfile: { mutating: true },
    generativeUpscale: { mutating: true },
    sampleColor: { mutating: true, valueKind: SAMPLED_COLOR_VALUE_KIND },
    splitChannels: { mutating: true, collectionOf: Document },
    trap: { mutating: true },
    suspendHistory: { mutating: true }
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
      [...DOCUMENT_WRITABLE_SCALARS, ...DOCUMENT_WRITABLE_REFS, ...DOCUMENT_WRITABLE_COLLECTIONS].map((name) => [name, "document.propertySet"])
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
      paste: "document.paste",
      calculations: "document.calculations",
      changeMode: "document.changeMode",
      convertProfile: "document.convertProfile",
      generativeUpscale: "document.generativeUpscale",
      sampleColor: "document.sampleColor",
      splitChannels: "document.splitChannels",
      trap: "document.trap",
      suspendHistory: "document.suspendHistory"
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

  class WebviewPsDocument extends RemoteClass {
    #saveAs: DocumentSaveAs | undefined;

    get saveAs(): DocumentSaveAs {
      return this.#saveAs ??= {
        bmp: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.bmp", [entry, options, asCopy]),
        gif: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.gif", [entry, options, asCopy]),
        jpg: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.jpg", [entry, options, asCopy]),
        png: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.png", [entry, options, asCopy]),
        psb: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.psb", [entry, options, asCopy]),
        psd: (entry, options, asCopy) => this[REMOTE_INVOKE]("document.saveAs.psd", [entry, options, asCopy])
      };
    }

    constructor(source: RemoteReference | RemoteConstructionRequest) {
      super(config, source);
    }

    async suspendHistory(
      callback: (callbackContext: SuspendHistoryContext) => void | Promise<void>,
      historyStateName: string
    ): Promise<void> {
      if (typeof callback !== "function") {
        throw new TypeError("Document.suspendHistory callback must be a function.");
      }
      if (typeof historyStateName !== "string" || historyStateName.length === 0) {
        throw new TypeError("Document.suspendHistory historyStateName must be a non-empty string.");
      }
      const callbackOwner = requirePhotoshopCallbackOwner(rpc);
      let callbackContext: MutableSuspendHistoryContext | undefined;
      const cancelReference = callbackOwner.retainCallback(async (...args: readonly unknown[]) => {
        if (!callbackContext) return;
        callbackContext.cancelled = true;
        await callbackContext.onCancel?.(normalizeCancellationEvent(args[0]));
      });
      const targetReference = callbackOwner.retainCallback(async (...args: readonly unknown[]) => {
        const state = (args[0] ?? {}) as { readonly isCancelled?: unknown };
        callbackContext = createSuspendHistoryContext(
          this as unknown as PsDocument,
          Boolean(state.isCancelled),
          (method, methodArgs) => this[REMOTE_INVOKE]<unknown>(method, methodArgs)
        );
        try {
          await callback(callbackContext.facade);
          await callbackContext.flushProgress();
        } catch (error) {
          try {
            await callbackContext.flushProgress();
          } catch {
            // The callback error is authoritative when callback and queued progress both fail.
          }
          throw error;
        }
      });
      try {
        await this[REMOTE_INVOKE]<void>("document.suspendHistory", [
          targetReference,
          cancelReference,
          historyStateName
        ]);
      } finally {
        callbackOwner.releaseCallback(targetReference);
        callbackOwner.releaseCallback(cancelReference);
        callbackContext = undefined;
      }
    }
  }

  return WebviewPsDocument as unknown as { new (reference: RemoteReference): PsDocument };
}

interface MutableSuspendHistoryContext {
  cancelled: boolean;
  onCancel: ((event?: CoreCancellationEvent) => void | Promise<void>) | undefined;
  facade: SuspendHistoryContext;
  flushProgress(): Promise<void>;
}

function normalizeCancellationEvent(value: unknown): CoreCancellationEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reason = (value as { readonly reason?: unknown }).reason;
  return typeof reason === "string" ? { reason } : undefined;
}

function createSuspendHistoryContext(
  document: PsDocument,
  initiallyCancelled: boolean,
  call: (method: string, args?: readonly unknown[]) => Promise<unknown>
): MutableSuspendHistoryContext {
  let progressQueue: Promise<void> = Promise.resolve();
  const state: MutableSuspendHistoryContext = {
    cancelled: initiallyCancelled,
    onCancel: undefined,
    facade: undefined as unknown as SuspendHistoryContext,
    flushProgress: () => progressQueue
  };
  const hostControl: ExecutionHostControl = {
    suspendHistory: (options) => call("document.modal.suspendHistory", [options]) as ReturnType<ExecutionHostControl["suspendHistory"]>,
    resumeHistory: (suspension: ResumeHistoryOptions, commit?: boolean) =>
      call("document.modal.resumeHistory", [suspension, commit]) as Promise<void>,
    registerAutoCloseDocument: (documentID) =>
      call("document.modal.registerAutoCloseDocument", [documentID]) as Promise<void>,
    unregisterAutoCloseDocument: (documentID) =>
      call("document.modal.unregisterAutoCloseDocument", [documentID]) as Promise<void>
  };
  state.facade = {
    document,
    get isCancelled() {
      return state.cancelled;
    },
    get onCancel() {
      return state.onCancel;
    },
    set onCancel(value) {
      state.onCancel = value;
    },
    reportProgress(options: ReportProgressOptions): void {
      progressQueue = progressQueue.then(() => call("document.modal.reportProgress", [options]) as Promise<void>);
    },
    hostControl
  };
  return state;
}
