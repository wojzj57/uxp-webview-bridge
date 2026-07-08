/**
 * UXP host adapter for the `photoshop` module.
 *
 * Owns the real `require('photoshop')` calls: it validates method names and arguments, resolves
 * reference envelopes to real DOM objects via its own handle registry, wraps mutating operations in
 * `core.executeAsModal`, and serializes results back into the shared transport shapes. Result
 * serialization is driven by the shared {@link PhotoshopResultKind} table (ADR 0009): each property
 * read / method return is classified `scalar`/`value`/`ref`/`collection` in the protocol module, and
 * the host dispatches on that classification rather than hand-maintained property sets — so it never
 * imports the WebView descriptors (AGENTS.md forbids `src/uxp` importing `src/webview`). Identity
 * dedup is done by keying the registry on the real object's DOM id (`Document:${id}` / `Layer:${id}`),
 * so the same object always yields the same reference id and the WebView cache can resolve two
 * references to one `===` proxy.
 *
 * The `action.*` branch is the exception to all of this: `batchPlay` is a verbatim JSON passthrough
 * (ADR 0010) — no reference decoding, no result serialization, just a shape check and an unconditional
 * modal wrap around the caller's descriptors and options.
 *
 * See docs/adr/0004 (handle registry), docs/adr/0005 (identity dedup), docs/adr/0007 (executeAsModal),
 * docs/adr/0009 (declarative type/value/collection registries), docs/adr/0010 (batchPlay passthrough).
 */

import {
  assertPhotoshopProtocolMethodName,
  PHOTOSHOP_MODULE_ID,
  PHOTOSHOP_REMOTE_TYPE,
  PHOTOSHOP_SNAPSHOT_KIND,
  photoshopMethodResultKind,
  photoshopPropertyResultKind,
  type PhotoshopProtocolMethodName,
  type PhotoshopResultKind,
  type PhotoshopSnapshotTransport
} from "@shared/photoshop-api/photoshop-protocol.js";
import { serializeValue } from "@shared/photoshop-api/value-objects.js";
import { isRemoteReference, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import { createRemoteHandleRegistry } from "@uxp/uxp-api/remote/index.js";
import type {
  PhotoshopChannelLike,
  PhotoshopDocumentLike,
  PhotoshopHostModule,
  PhotoshopLayerLike
} from "./types.js";

declare const require: (moduleName: "photoshop") => PhotoshopHostModule;

/** Document scalar properties that are readable (keyed `document.propertyGet`). */
const DOCUMENT_SCALARS = new Set([
  "id",
  "saved",
  "name",
  "title",
  "path",
  "width",
  "height",
  "resolution",
  "cloudDocument",
  "cloudWorkAreaDirectory",
  "pixelAspectRatio"
]);

/** Layer properties that are readable scalars (keyed `layer.propertyGet`). */
const LAYER_SCALARS = new Set([
  "id",
  "locked",
  "isBackgroundLayer",
  "kind",
  "name",
  "opacity",
  "fillOpacity",
  "visible",
  "blendMode",
  "allLocked",
  "pixelsLocked",
  "positionLocked",
  "transparentPixelsLocked",
  "isClippingMask",
  "filterMaskDensity",
  "filterMaskFeather",
  "layerMaskDensity",
  "layerMaskFeather",
  "vectorMaskDensity",
  "vectorMaskFeather",
  "selected"
]);

/** Writable Layer scalars (each set is a modal-wrapped mutation). */
const LAYER_WRITABLE_SCALARS = new Set([
  "name",
  "opacity",
  "fillOpacity",
  "visible",
  "blendMode",
  "allLocked",
  "pixelsLocked",
  "positionLocked",
  "transparentPixelsLocked",
  "isClippingMask",
  "filterMaskDensity",
  "filterMaskFeather",
  "layerMaskDensity",
  "layerMaskFeather",
  "vectorMaskDensity",
  "vectorMaskFeather",
  "selected"
]);

/** Writable Document scalars (non-mutating; a `pixelAspectRatio` write does not enter modal). */
const DOCUMENT_WRITABLE_SCALARS = new Set(["pixelAspectRatio"]);

/** Non-mutating Document methods (called directly, never in a modal scope). */
const DOCUMENT_READ_METHODS = new Set(["duplicate"]);

/** Mutating Document methods (wrapped in executeAsModal). */
const DOCUMENT_MUTATING_METHODS = new Set([
  "close",
  "closeWithoutSaving",
  "flatten",
  "mergeVisibleLayers",
  "revealAll",
  "rasterizeAllLayers",
  "crop",
  "resizeCanvas",
  "resizeImage",
  "trim",
  "rotate",
  "save",
  "createLayer",
  "createPixelLayer",
  "createTextLayer",
  "createLayerGroup",
  "groupLayers",
  "duplicateLayers",
  "linkLayers",
  "paste"
]);

/** Mutating Layer methods (all Layer methods here mutate). */
const LAYER_MUTATING_METHODS = new Set([
  "delete",
  "duplicate",
  "link",
  "unlink",
  "move",
  "translate",
  "flip",
  "scale",
  "rotate",
  "merge",
  "rasterize"
]);

/**
 * Channel scalar properties that are readable (keyed `channel.propertyGet`). `histogram` is a raw
 * `number[]` scalar; `color`/`parent` are value/ref and dispatched via the result-kind table.
 */
const CHANNEL_SCALARS = new Set(["name", "opacity", "visible", "kind", "histogram"]);

/**
 * Writable Channel scalars (each set is a modal-wrapped mutation). `color` is writable too but is a
 * value object, not a scalar, so it is handled separately in the propertySet branch.
 */
const CHANNEL_WRITABLE_SCALARS = new Set(["name", "opacity", "visible", "kind"]);

/** Mutating Channel methods (all Channel methods here mutate). */
const CHANNEL_MUTATING_METHODS = new Set(["duplicate", "merge", "remove"]);

const photoshopRegistry = createRemoteHandleRegistry();

export const photoshopModuleAdapter: UxpModuleAdapter = {
  moduleId: PHOTOSHOP_MODULE_ID,
  capability: "photoshop",
  dispatch: (method, args) => dispatchPhotoshopCall(method, args),
  destroy: destroyPhotoshopHandles
};

export function dispatchPhotoshopCall(method: string, args: readonly unknown[]): unknown | Promise<unknown> {
  assertPhotoshopProtocolMethodName(method);
  photoshopRegistry.prune();

  if (method.startsWith("app.")) {
    return dispatchAppCall(method, args);
  }
  if (method.startsWith("document.")) {
    return dispatchDocumentCall(method, args);
  }
  if (method.startsWith("layer.")) {
    return dispatchLayerCall(method, args);
  }
  if (method.startsWith("layers.")) {
    return dispatchLayersCall(method, args);
  }
  if (method.startsWith("channels.")) {
    return dispatchChannelsCall(method, args);
  }
  if (method.startsWith("channel.")) {
    return dispatchChannelCall(method, args);
  }
  if (method.startsWith("action.")) {
    return dispatchActionCall(method, args);
  }
  throw new Error(`Unsupported photoshop method: ${method}`);
}

export function destroyPhotoshopHandles(): void {
  photoshopRegistry.clear();
}

// ---------------------------------------------------------------------------- app.*

function dispatchAppCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  const app = getPhotoshop().app;

  switch (method) {
    case "app.activeDocument":
      return serializeDocument(app.activeDocument);
    case "app.documents": {
      const documents = Array.from({ length: app.documents.length }, (_, index) => app.documents[index]);
      return documents.map((document) => serializeDocument(document as PhotoshopDocumentLike));
    }
    case "app.open": {
      const decoded = decodeArgs(args);
      const result = callMethod(app, "open", decoded);
      return resolveMaybePromise(result, (document) => serializeDocument(document as PhotoshopDocumentLike));
    }
    default:
      throw new Error(`Unsupported photoshop app method: ${method}`);
  }
}

// ---------------------------------------------------------------------------- document.*

function dispatchDocumentCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "document.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }

  if (method === "document.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    const document = getDocument(reference);
    return serializeDocumentProperty(reference, name, document[name]);
  }

  if (method === "document.propertySet") {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    if (!DOCUMENT_WRITABLE_SCALARS.has(name)) {
      throw new Error(`Document property is not writable: ${name}`);
    }
    const document = getDocument(reference);
    document[name] = decodeValue(value);
    return undefined;
  }

  if (method === "document.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const document = getDocument(reference);
    const names = assertStringArray(propertyNames, method);
    const result: Record<string, unknown> = {};
    for (const name of names) {
      result[name] = serializeDocumentProperty(reference, name, document[name]);
    }
    return result;
  }

  if (method === "document.batchSet") {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const document = getDocument(reference);
    const props = assertPropertyMap(values, method);
    for (const name of Object.keys(props)) {
      if (!DOCUMENT_WRITABLE_SCALARS.has(name)) {
        throw new Error(`Document property is not writable: ${name}`);
      }
      document[name] = decodeValue(props[name]);
    }
    return undefined;
  }

  // Methods
  const methodName = method.slice("document.".length);
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const document = getDocument(reference);
  const methodArgs = decodeArgs(rest);

  const invoke = (): unknown => callMethod(document, methodName, methodArgs);
  const run = DOCUMENT_MUTATING_METHODS.has(methodName)
    ? executeAsModal(methodName, invoke)
    : DOCUMENT_READ_METHODS.has(methodName)
      ? invoke()
      : unsupported(method);

  return resolveMaybePromise(run, (value) => serializeDocumentMethodResult(reference, methodName, value));
}

function serializeDocumentProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Document, name);
  if (resultKind.kind === "scalar" && !DOCUMENT_SCALARS.has(name)) {
    throw new Error(`Unknown document property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, value);
}

function serializeDocumentMethodResult(ownerReference: RemoteReference, methodName: string, value: unknown): unknown {
  return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Document, methodName), ownerReference, value);
}

// ---------------------------------------------------------------------------- layer.*

function dispatchLayerCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "layer.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }

  if (method === "layer.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    const layer = getLayer(reference);
    return serializeLayerProperty(reference, name, layer[name]);
  }

  if (method === "layer.propertySet") {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    if (!LAYER_WRITABLE_SCALARS.has(name)) {
      throw new Error(`Layer property is not writable: ${name}`);
    }
    const layer = getLayer(reference);
    const decoded = decodeValue(value);
    return executeAsModal(`layer.set.${name}`, () => {
      layer[name] = decoded;
      return undefined;
    });
  }

  if (method === "layer.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const layer = getLayer(reference);
    const names = assertStringArray(propertyNames, method);
    const result: Record<string, unknown> = {};
    for (const name of names) {
      result[name] = serializeLayerProperty(reference, name, layer[name]);
    }
    return result;
  }

  if (method === "layer.batchSet") {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const layer = getLayer(reference);
    const props = assertPropertyMap(values, method);
    for (const name of Object.keys(props)) {
      if (!LAYER_WRITABLE_SCALARS.has(name)) {
        throw new Error(`Layer property is not writable: ${name}`);
      }
    }
    // All writable layer scalars mutate: apply the whole batch under a single modal scope.
    return executeAsModal("layer.batchSet", () => {
      for (const name of Object.keys(props)) {
        layer[name] = decodeValue(props[name]);
      }
      return undefined;
    });
  }

  // Methods (all mutating)
  const methodName = method.slice("layer.".length);
  if (!LAYER_MUTATING_METHODS.has(methodName)) {
    return unsupported(method);
  }
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const layer = getLayer(reference);
  const methodArgs = decodeArgs(rest);
  const run = executeAsModal(methodName, () => callMethod(layer, methodName, methodArgs));
  return resolveMaybePromise(run, (value) => serializeLayerMethodResult(reference, methodName, value));
}

function serializeLayerProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Layer, name);
  if (resultKind.kind === "scalar" && !LAYER_SCALARS.has(name)) {
    throw new Error(`Unknown layer property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, value);
}

function serializeLayerMethodResult(ownerReference: RemoteReference, methodName: string, value: unknown): unknown {
  return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Layer, methodName), ownerReference, value);
}

// ---------------------------------------------------------------------------- layers.*

function dispatchLayersCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "layers.snapshot") {
    const [reference, collectionKey] = expectReferenceArgs(args, 1, 2, method);
    const owner = resolveOwner(reference);
    const collection = collectionKey === undefined ? owner : (owner as Record<string, unknown>)[assertString(collectionKey, method)];
    return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.Layer, reference, collection);
  }

  if (method === "layers.getByName") {
    const [reference, name] = expectReferenceArgs(args, 2, 2, method);
    const layerName = assertString(name, `${method} name`);
    const collection = getMemberArray(resolveOwnerLayers(reference));
    const match = collection.find((layer) => (layer as PhotoshopLayerLike).name === layerName);
    return match == null ? null : serializeLayer(match as PhotoshopLayerLike);
  }

  if (method === "layers.add") {
    const [reference, options] = expectReferenceArgs(args, 1, 2, method);
    const owner = resolveOwner(reference) as Record<string, unknown>;
    const decodedOptions = decodeValue(options);
    const run = executeAsModal("layers.add", () => callMethod(owner, "createLayer", [decodedOptions]));
    return resolveMaybePromise(run, (value) => serializeLayer(value as PhotoshopLayerLike));
  }

  throw new Error(`Unsupported photoshop layers method: ${method}`);
}

// ---------------------------------------------------------------------------- channel.*

function dispatchChannelCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "channel.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }

  if (method === "channel.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    const channel = getChannel(reference);
    return serializeChannelProperty(reference, name, channel[name]);
  }

  if (method === "channel.propertySet") {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    const channel = getChannel(reference);
    return executeAsModal(`channel.set.${name}`, () => {
      assignChannelProperty(channel, name, value);
      return undefined;
    });
  }

  if (method === "channel.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const channel = getChannel(reference);
    const names = assertStringArray(propertyNames, method);
    const result: Record<string, unknown> = {};
    for (const name of names) {
      result[name] = serializeChannelProperty(reference, name, channel[name]);
    }
    return result;
  }

  if (method === "channel.batchSet") {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const channel = getChannel(reference);
    const props = assertPropertyMap(values, method);
    // All writable channel members mutate: apply the whole batch under a single modal scope.
    return executeAsModal("channel.batchSet", () => {
      for (const name of Object.keys(props)) {
        assignChannelProperty(channel, name, props[name]);
      }
      return undefined;
    });
  }

  // Methods (all mutating)
  const methodName = method.slice("channel.".length);
  if (!CHANNEL_MUTATING_METHODS.has(methodName)) {
    return unsupported(method);
  }
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const channel = getChannel(reference);
  const methodArgs = decodeArgs(rest);
  const run = executeAsModal(methodName, () => callMethod(channel, methodName, methodArgs));
  return resolveMaybePromise(run, (value) => serializeChannelMethodResult(reference, methodName, value));
}

/**
 * Assign a writable Channel property. Scalars pass through `decodeValue`; `color` accepts a
 * `SolidColorInput` (a plain single-model bag such as `{ rgb: { red, green, blue } }` or a full
 * `PsSolidColor`) — never a value envelope, since the WebView write path does not value-encode
 * (ADR 0003 write queue + RemoteClass `#setProperty`). The host builds a live `SolidColor` from it.
 */
function assignChannelProperty(channel: PhotoshopChannelLike, name: string, value: unknown): void {
  if (name === "color") {
    channel.color = buildSolidColor(decodeValue(value));
    return;
  }
  if (!CHANNEL_WRITABLE_SCALARS.has(name)) {
    throw new Error(`Channel property is not writable: ${name}`);
  }
  channel[name] = decodeValue(value);
}

function serializeChannelProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Channel, name);
  if (resultKind.kind === "scalar" && !CHANNEL_SCALARS.has(name)) {
    throw new Error(`Unknown channel property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, value);
}

function serializeChannelMethodResult(ownerReference: RemoteReference, methodName: string, value: unknown): unknown {
  return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Channel, methodName), ownerReference, value);
}

/**
 * Build a live Photoshop `SolidColor` from a `SolidColorInput`. The input is a plain bag carrying
 * one or more color-model views (`rgb`/`hsb`/`cmyk`/`lab`/`gray`); each present model is copied onto
 * the corresponding sub-model, matching Adobe's model-switch-on-write behavior (RFC-0011 OQ#3). At
 * least one model must be present.
 */
function buildSolidColor(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    throw new Error("channel.color requires a SolidColorInput object.");
  }
  const source = input as Record<string, unknown>;
  const SolidColorCtor = getPhotoshop().app.SolidColor as { new (): Record<string, unknown> } | undefined;
  if (typeof SolidColorCtor !== "function") {
    throw new Error("photoshop.app.SolidColor constructor is unavailable.");
  }
  const color = new SolidColorCtor();
  let applied = false;
  for (const model of ["rgb", "hsb", "cmyk", "lab", "gray"] as const) {
    const view = source[model];
    if (view && typeof view === "object") {
      Object.assign(color[model] as Record<string, unknown>, view);
      applied = true;
    }
  }
  if (!applied) {
    throw new Error("channel.color requires at least one color-model view (rgb/hsb/cmyk/lab/gray).");
  }
  return color;
}

// ---------------------------------------------------------------------------- channels.*

function dispatchChannelsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "channels.snapshot") {
    const [reference, collectionKey] = expectReferenceArgs(args, 1, 2, method);
    const document = getDocument(reference);
    const collection =
      collectionKey === undefined
        ? (document as Record<string, unknown>).channels
        : (document as Record<string, unknown>)[assertString(collectionKey, method)];
    return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.Channel, reference, collection);
  }

  if (method === "channels.getByName") {
    const [reference, name] = expectReferenceArgs(args, 2, 2, method);
    const channelName = assertString(name, `${method} name`);
    const collection = getMemberArray((getDocument(reference) as Record<string, unknown>).channels);
    const match = collection.find((channel) => (channel as PhotoshopChannelLike).name === channelName);
    return match == null ? null : serializeChannel(match as PhotoshopChannelLike);
  }

  throw new Error(`Unsupported photoshop channels method: ${method}`);
}

// ---------------------------------------------------------------------------- action.*

/**
 * Low-level `batchPlay` passthrough (ADR 0010). Descriptors are opaque JSON: the host validates only
 * shape (`commands` is an array, `options` is an object or absent), never walks or rewrites them, and
 * never runs them through the handle registry (that would corrupt native `_ref`/`_id`, which live in
 * Photoshop's own id space). The call is wrapped in `executeAsModal` unconditionally; the caller's
 * `options` are forwarded verbatim so `modalBehavior`/`synchronousExecution`/`commandName` are
 * honored by Adobe's own API. The raw result descriptor array is returned unchanged.
 */
function dispatchActionCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): Promise<unknown> {
  if (method !== "action.batchPlay") {
    throw new Error(`Unsupported photoshop action method: ${method}`);
  }
  expectArgs(args, 1, 2, method);
  const [commands, options] = args;
  if (!Array.isArray(commands)) {
    throw new Error(`${method} requires an array of command descriptors.`);
  }
  if (options !== undefined && (typeof options !== "object" || options === null)) {
    throw new Error(`${method} options must be an object when provided.`);
  }
  const commandOptions = options as Record<string, unknown> | undefined;
  const commandName = typeof commandOptions?.commandName === "string" ? commandOptions.commandName : method;
  return executeAsModal(commandName, () => getPhotoshop().action.batchPlay(commands, commandOptions));
}

/** The owner of a `Layers` collection is either a Document or a Layer (group). */
function resolveOwner(reference: RemoteReference): PhotoshopDocumentLike | PhotoshopLayerLike {
  if (reference.type === PHOTOSHOP_REMOTE_TYPE.Document) {
    return getDocument(reference);
  }
  if (reference.type === PHOTOSHOP_REMOTE_TYPE.Layer) {
    return getLayer(reference);
  }
  throw new Error(`Invalid layers owner reference type: ${reference.type}`);
}

/**
 * Resolve the owner's default `Layers` collection. A `Layers` snapshot is captured from an owner's
 * `.layers` collection (a Document or a Layer group both expose `.layers`), so name/index lookups
 * that carry only the owner reference must iterate that `.layers` collection — never the owner
 * object itself, which is not layer-array-shaped.
 */
function resolveOwnerLayers(reference: RemoteReference): unknown {
  const owner = resolveOwner(reference) as { layers?: unknown };
  return owner.layers ?? owner;
}

// ---------------------------------------------------------------------------- serialization

function serializeDocument(document: PhotoshopDocumentLike): RemoteReference {
  const key = `${PHOTOSHOP_REMOTE_TYPE.Document}:${document.id}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Document, key, () => document);
}

function serializeLayer(layer: PhotoshopLayerLike): RemoteReference {
  const key = `${PHOTOSHOP_REMOTE_TYPE.Layer}:${layer.id}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Layer, key, () => layer);
}

/**
 * Serialize a native `Channel`. Unlike Document/Layer, a Channel has no stable DOM id, so identity
 * is non-deduped (RFC-0011 OQ#1): `register` mints a fresh unique handle id per read, and two reads
 * of the same channel yield distinct references with no `===` guarantee on the WebView side.
 */
function serializeChannel(channel: PhotoshopChannelLike): RemoteReference {
  return photoshopRegistry.register(PHOTOSHOP_REMOTE_TYPE.Channel, channel);
}

/**
 * Serialize a native DOM result per its shared {@link PhotoshopResultKind} classification (ADR 0009).
 * The kind table (in the shared protocol) is the single source of truth; the host never
 * hand-maintains reference/collection/value property sets. `ownerReference` is threaded so a
 * collection snapshot can carry its owner.
 */
function serializeResult(resultKind: PhotoshopResultKind, ownerReference: RemoteReference, value: unknown): unknown {
  switch (resultKind.kind) {
    case "scalar":
      return value ?? undefined;
    case "value":
      return serializeValue(resultKind.valueKind, value);
    case "ref":
      return value == null ? null : serializeReference(resultKind.refType, value);
    case "collection":
      return serializeSnapshot(resultKind.memberKind, ownerReference, value);
    default:
      throw new Error("Unknown photoshop result kind.");
  }
}

/** Serialize a single reference by its remote type name. */
function serializeReference(refType: string, value: unknown): RemoteReference {
  if (refType === PHOTOSHOP_REMOTE_TYPE.Document) {
    return serializeDocument(value as PhotoshopDocumentLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Layer) {
    return serializeLayer(value as PhotoshopLayerLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Channel) {
    return serializeChannel(value as PhotoshopChannelLike);
  }
  throw new Error(`Unknown photoshop reference type: ${refType}`);
}

function serializeSnapshot(memberKind: string, ownerReference: RemoteReference, collection: unknown): PhotoshopSnapshotTransport {
  const members = getMemberArray(collection);
  const memberIds = members.map((member) => serializeReference(memberKind, member).id);
  return { kind: PHOTOSHOP_SNAPSHOT_KIND, memberKind, owner: ownerReference, memberIds };
}

function getMemberArray(collection: unknown): readonly unknown[] {
  if (Array.isArray(collection)) {
    return collection;
  }
  if (collection && typeof (collection as ArrayLike<unknown>).length === "number") {
    const arrayLike = collection as ArrayLike<unknown>;
    return Array.from({ length: arrayLike.length }, (_, index) => arrayLike[index]);
  }
  throw new Error("Expected a member collection.");
}

// ---------------------------------------------------------------------------- modal execution

function executeAsModal<T>(commandName: string, fn: () => T | Promise<T>): Promise<T> {
  return getPhotoshop().core.executeAsModal(async () => fn(), { commandName });
}

// ---------------------------------------------------------------------------- handles & args

function getDocument(reference: RemoteReference): PhotoshopDocumentLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Document) as PhotoshopDocumentLike;
}

function getLayer(reference: RemoteReference): PhotoshopLayerLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Layer) as PhotoshopLayerLike;
}

function getChannel(reference: RemoteReference): PhotoshopChannelLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Channel) as PhotoshopChannelLike;
}

function decodeArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => decodeValue(arg));
}

function decodeValue(value: unknown): unknown {
  if (isRemoteReference(value)) {
    return photoshopRegistry.resolve(value, value.type);
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeValue(nested)]));
  }
  return value;
}

function callMethod(target: unknown, methodName: string, args: readonly unknown[]): unknown {
  const method = (target as Record<string, unknown>)[methodName];
  if (typeof method !== "function") {
    throw new Error(`photoshop target does not implement ${methodName}.`);
  }
  return (method as (...callArgs: unknown[]) => unknown).apply(target, [...args]);
}

function resolveMaybePromise(value: unknown, serialize: (resolved: unknown) => unknown): unknown | Promise<unknown> {
  if (value && typeof (value as Promise<unknown>).then === "function") {
    return (value as Promise<unknown>).then(serialize);
  }
  return serialize(value);
}

function expectReferenceArgs(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): [RemoteReference, ...unknown[]] {
  expectArgs(args, minLength, maxLength, method);
  const reference = args[0];
  if (!isRemoteReference(reference)) {
    throw new Error(`${method} requires a photoshop remote reference as its first argument.`);
  }
  return args as [RemoteReference, ...unknown[]];
}

function expectArgs(args: readonly unknown[], minLength: number, maxLength: number, method: string): void {
  if (args.length < minLength || args.length > maxLength) {
    const range = maxLength === Number.POSITIVE_INFINITY ? `at least ${minLength}` : minLength === maxLength ? `${minLength}` : `${minLength}-${maxLength}`;
    throw new Error(`${method} expects ${range} arguments.`);
  }
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertStringArray(value: unknown, method: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${method} requires an array of property names.`);
  }
  return value.map((name) => assertString(name, `${method} property`));
}

function assertPropertyMap(value: unknown, method: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(`${method} requires a property map.`);
  }
  return value as Record<string, unknown>;
}

function unsupported(method: string): never {
  throw new Error(`Unsupported photoshop method: ${method}`);
}

function getPhotoshop(): PhotoshopHostModule {
  return require("photoshop");
}
