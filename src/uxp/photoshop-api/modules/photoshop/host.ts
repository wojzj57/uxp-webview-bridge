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
 * The `action.*` branch is the exception to all of this: action descriptors and references are
 * opaque native Photoshop JSON (ADR 0010) — no bridge-reference decoding or result serialization.
 * Potentially mutating batchPlay variants enter a modal scope; read-only id/reference helpers do not.
 *
 * See docs/adr/0004 (handle registry), docs/adr/0005 (identity dedup), docs/adr/0007 (executeAsModal),
 * docs/adr/0009 (declarative type/value/collection registries), docs/adr/0010 (batchPlay passthrough).
 */

import {
  assertPhotoshopProtocolMethodName,
  PHOTOSHOP_APP_REFERENCE_ID,
  PHOTOSHOP_MODULE_ID,
  PHOTOSHOP_REMOTE_TYPE,
  PHOTOSHOP_SNAPSHOT_KIND,
  photoshopMethodResultKind,
  photoshopPropertyResultKind,
  type PhotoshopProtocolMethodName,
  type PhotoshopResultKind,
  type PhotoshopSnapshotTransport
} from "@shared/photoshop-api/photoshop-protocol.js";
import {
  PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES,
  PHOTOSHOP_PREFERENCE_ROOT_PROPERTIES,
  isPhotoshopPreferenceType,
  type PhotoshopPreferenceCategoryType
} from "@shared/photoshop-api/photoshop-preferences.js";
import { isPhotoshopValueTransport, serializeValue } from "@shared/photoshop-api/value-objects.js";
import { isRemoteReference, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import { isUxpStorageEntryReference } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import { createRemoteHandleRegistry } from "@uxp/uxp-api/remote/index.js";
import { resolveUxpStorageEntryReference } from "@uxp/uxp-api/modules/uxp/persistent-file-storage/host.js";
import type {
  PhotoshopChannelLike,
  PhotoshopColorSamplerLike,
  PhotoshopCountItemLike,
  PhotoshopActionLike,
  PhotoshopActionSetLike,
  PhotoshopDocumentLike,
  PhotoshopGuideLike,
  PhotoshopHistoryStateLike,
  PhotoshopHostModule,
  PhotoshopLayerLike,
  PhotoshopLayerCompLike,
  PhotoshopPathItemLike,
  PhotoshopPathPointLike,
  PhotoshopSelectionLike,
  PhotoshopSubPathItemLike,
  PhotoshopTextFontLike,
  PhotoshopToolLike,
  PhotoshopTextItemLike,
  PhotoshopCharacterStyleLike,
  PhotoshopParagraphStyleLike,
  PhotoshopTextWarpStyleLike,
  PhotoshopPreferencesLike,
  PhotoshopApp
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
  "pixelAspectRatio",
  "typename",
  "histogram",
  "mode",
  "zoom",
  "quickMaskMode",
  "bitsPerChannel",
  "colorProfileName",
  "colorProfileType"
]);

/** Layer properties that are readable scalars (keyed `layer.propertyGet`). */
const LAYER_SCALARS = new Set([
  "typename",
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

/** Writable Document scalars; only `pixelAspectRatio` retains the existing non-modal write path. */
const DOCUMENT_WRITABLE_SCALARS = new Set(["pixelAspectRatio", "quickMaskMode", "bitsPerChannel", "colorProfileName", "colorProfileType"]);
const DOCUMENT_WRITABLE_REFS = new Set(["activeHistoryState", "activeHistoryBrushSource"]);
const DOCUMENT_WRITABLE_COLLECTIONS = new Set(["activeLayers", "activeChannels"]);

/** Mutating Document methods (wrapped in executeAsModal). */
const DOCUMENT_MUTATING_METHODS = new Set([
  "duplicate",
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
  "paste",
  "sampleColor",
  "calculations",
  "changeMode",
  "convertProfile",
  "generativeUpscale",
  "splitChannels",
  "trap"
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
  "rasterize",
  "applyAddNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds",
  "applyCustomFilter", "applyDeInterlace", "applyDespeckle", "applyDifferenceClouds",
  "applyDiffuseGlow", "applyDisplace", "applyDustAndScratches", "applyGaussianBlur",
  "applyGlassEffect", "applyHighPass", "applyLensBlur", "applyLensFlare", "applyMaximum",
  "applyMinimum", "applyMedianNoise", "applyMotionBlur", "applyNTSC", "applyOceanRipple",
  "applyOffset", "applyTwirl", "applyPinch", "applyPolarCoordinates", "applyRipple",
  "applySharpen", "applySharpenEdges", "applySharpenMore", "applyShear", "applySmartBlur",
  "applySpherize", "applyUnSharpMask", "applyWave", "applyZigZag", "applyImage",
  "bringToFront", "sendToBack", "skew", "clear", "copy", "cut"
]);

const TEXT_ITEM_SCALARS = new Set(["typename", "contents", "orientation", "isPointText", "isParagraphText"]);
const TEXT_ITEM_WRITABLE = new Set(["contents", "textClickPoint", "orientation"]);
const TEXT_ITEM_METHODS = new Set(["convertToParagraphText", "convertToPointText", "convertToShape", "createWorkPath"]);
const CHARACTER_STYLE_PROPERTIES = new Set([
  "font", "size", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic",
  "useAutoLeading", "leading", "tracking", "baselineShift", "horizontalDiacriticPosition",
  "verticalDiacriticPosition", "autoKerning", "capitalization", "baseline", "strikeThrough",
  "underline", "ligatures", "alternateLigatures", "fractions", "ordinals", "swash",
  "titlingAlternates", "stylisticAlternates", "language", "characterAlignment", "noBreak",
  "color", "kashidas", "middleEasternTextDirection", "middleEasternDigitsType",
  "fractionalWidths", "antiAliasMethod"
]);
const PARAGRAPH_STYLE_PROPERTIES = new Set([
  "justification", "justificationFeatures", "leftIndent", "rightIndent", "firstLineIndent",
  "spaceBefore", "kashidaWidth", "kinsoku", "mojikumi", "spaceAfter", "hyphenation",
  "hyphenationFeatures", "layoutMode", "features"
]);
const TEXT_WARP_STYLE_PROPERTIES = new Set(["style", "direction", "bend", "horizontalDistortion", "verticalDistortion"]);

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

const SELECTION_SCALARS = new Set(["typename", "docId", "solid"]);
const SELECTION_MUTATING_METHODS = new Set([
  "contract",
  "deselect",
  "expand",
  "feather",
  "grow",
  "inverse",
  "load",
  "makeWorkPath",
  "selectAll",
  "selectRectangle",
  "selectEllipse",
  "selectPolygon",
  "selectRow",
  "selectColumn",
  "save",
  "saveTo",
  "selectBorder",
  "smooth",
  "translateBoundary",
  "resizeBoundary",
  "rotateBoundary"
]);

const HISTORY_STATE_SCALARS = new Set(["typename", "id", "docId", "name", "snapshot"]);
const COLOR_SAMPLER_SCALARS = new Set(["typename", "docId"]);
const COUNT_ITEM_SCALARS = new Set(["itemIndex", "groupIndex", "typename"]);
const LAYER_COMP_SCALARS = new Set(["typename", "id", "docId", "name", "comment", "selected", "appearance", "position", "visibility", "childComp"]);
const LAYER_COMP_WRITABLE = new Set(["name", "comment", "appearance", "position", "visibility", "childComp"]);
const COUNT_ITEMS_METHODS = new Set([
  "add", "removeAllFromActiveGroup", "getAll", "createGroup", "renameActiveGroup",
  "removeGroupByIndex", "toggleActiveGroupVisibility", "activateGroupByIndex",
  "setActiveMarkerSize", "setActiveLabelSize", "setActiveColor"
]);
const LAYER_COMP_METHODS = new Set(["apply", "duplicate", "recapture", "remove", "resetLayerComp"]);
const LAYER_COMPS_METHODS = new Set(["add", "getAllByName", "removeAll"]);
const GUIDE_SCALARS = new Set(["typename", "id", "docId", "direction", "coordinate"]);
const PATH_ITEM_SCALARS = new Set(["typename", "id", "docId", "kind", "name"]);
const SUB_PATH_ITEM_SCALARS = new Set(["typename", "operation", "closed"]);
const PATH_POINT_SCALARS = new Set(["typename", "anchor", "kind", "leftDirection", "rightDirection"]);
const PATH_ITEM_METHODS = new Set(["deselect", "duplicate", "fillPath", "makeClippingPath", "makeSelection", "remove", "select", "strokePath"]);

const APP_SCALARS = new Set(["typename", "displayDialogs"]);
const APP_READABLE = new Set(["typename", "preferences", "displayDialogs", "activeDocument", "currentTool", "actionTree", "documents", "foregroundColor", "backgroundColor", "fonts"]);
const APP_WRITABLE = new Set(["displayDialogs", "activeDocument", "foregroundColor", "backgroundColor"]);
const TEXT_FONT_SCALARS = new Set(["family", "name", "postScriptName", "style", "typename", "parent"]);
const TOOL_SCALARS = new Set(["id", "typename"]);
const ACTION_SET_SCALARS = new Set(["typename", "index", "id", "name", "actions"]);
const ACTION_SCALARS = new Set(["typename", "id", "index", "name", "parent"]);

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
  if (method.startsWith("documents.")) return dispatchDocumentsCall(method, args);
  if (method.startsWith("textFonts.")) return dispatchTextFontsCall(method, args);
  if (method.startsWith("textFont.")) return dispatchTextFontCall(method, args);
  if (method.startsWith("tool.")) return dispatchToolCall(method, args);
  if (method.startsWith("actionSet.")) return dispatchActionObjectCall(PHOTOSHOP_REMOTE_TYPE.ActionSet, method, args);
  if (method.startsWith("actionObject.")) return dispatchActionObjectCall(PHOTOSHOP_REMOTE_TYPE.Action, method, args);
  if (method.startsWith("preferences.")) return dispatchPreferencesCall(method, args);
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
  if (method.startsWith("colorSamplers.")) return dispatchColorSamplersCall(method, args);
  if (method.startsWith("colorSampler.")) return dispatchColorSamplerCall(method, args);
  if (method.startsWith("countItems.")) return dispatchCountItemsCall(method, args);
  if (method.startsWith("countItem.")) return dispatchCountItemCall(method, args);
  if (method.startsWith("layerComps.")) return dispatchLayerCompsCall(method, args);
  if (method.startsWith("layerComp.")) return dispatchLayerCompCall(method, args);
  if (method.startsWith("selection.")) {
    return dispatchSelectionCall(method, args);
  }
  if (method.startsWith("historyStates.")) {
    return dispatchHistoryStatesCall(method, args);
  }
  if (method.startsWith("historyState.")) {
    return dispatchHistoryStateCall(method, args);
  }
  if (method.startsWith("guide.")) {
    return dispatchGuideCall(method, args);
  }
  if (method.startsWith("guides.")) {
    return dispatchGuidesCall(method, args);
  }
  if (method.startsWith("pathItems.")) {
    return dispatchPathItemsCall(method, args);
  }
  if (method.startsWith("pathItem.")) {
    return dispatchPathItemCall(method, args);
  }
  if (method.startsWith("subPathItem.")) {
    return dispatchReadonlyPathObjectCall(PHOTOSHOP_REMOTE_TYPE.SubPathItem, method, args);
  }
  if (method.startsWith("pathPoint.")) {
    return dispatchReadonlyPathObjectCall(PHOTOSHOP_REMOTE_TYPE.PathPoint, method, args);
  }
  if (method.startsWith("textItem.")) return dispatchTextItemCall(method, args);
  if (method.startsWith("characterStyle.")) {
    return dispatchTextStyleCall(PHOTOSHOP_REMOTE_TYPE.CharacterStyle, "characterStyle", CHARACTER_STYLE_PROPERTIES, method, args);
  }
  if (method.startsWith("paragraphStyle.")) {
    return dispatchTextStyleCall(PHOTOSHOP_REMOTE_TYPE.ParagraphStyle, "paragraphStyle", PARAGRAPH_STYLE_PROPERTIES, method, args);
  }
  if (method.startsWith("textWarpStyle.")) {
    return dispatchTextStyleCall(PHOTOSHOP_REMOTE_TYPE.TextWarpStyle, "textWarpStyle", TEXT_WARP_STYLE_PROPERTIES, method, args);
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

function dispatchAppCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "app.activeDocument") { expectArgs(args, 0, 0, method); return serializeDocument(getPhotoshop().app.activeDocument); }
  if (method === "app.documents") {
    expectArgs(args, 0, 0, method);
    const app = getPhotoshop().app;
    return getMemberArray(app.documents).map((document) => serializeDocument(document as PhotoshopDocumentLike));
  }
  if (method === "app.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    getPhotoshopApp(reference);
    return undefined;
  }
  if (method === "app.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    if (!APP_READABLE.has(name)) throw new Error(`Unknown Photoshop property: ${name}`);
    const app = getPhotoshopApp(reference);
    return serializeAppProperty(reference, name, app[name]);
  }
  if (method === "app.propertySet") {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    if (!APP_WRITABLE.has(name)) throw new Error(`Photoshop property is not writable: ${name}`);
    const app = getPhotoshopApp(reference);
    const assign = () => {
      app[name] = name === "foregroundColor" || name === "backgroundColor"
        ? buildSolidColor(decodeValue(value))
        : decodeValue(value);
      return undefined;
    };
    return name === "displayDialogs" ? assign() : executeAsModal(`app.set.${name}`, assign);
  }
  if (method === "app.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const names = assertStringArray(propertyNames, method);
    for (const name of names) if (!APP_READABLE.has(name)) throw new Error(`Unknown Photoshop property: ${name}`);
    const app = getPhotoshopApp(reference);
    return Object.fromEntries(names.map((name) => [name, serializeAppProperty(reference, name, app[name])]));
  }
  if (method === "app.batchSet") {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const props = assertPropertyMap(values, method);
    for (const name of Object.keys(props)) if (!APP_WRITABLE.has(name)) throw new Error(`Photoshop property is not writable: ${name}`);
    const app = getPhotoshopApp(reference);
    return executeAsModal("app.batchSet", () => {
      for (const [name, value] of Object.entries(props)) {
        app[name] = name === "foregroundColor" || name === "backgroundColor" ? buildSolidColor(decodeValue(value)) : decodeValue(value);
      }
    });
  }

  const methodName = method.slice("app.".length);
  const legacyOpen = method === "app.open" && !isRemoteReference(args[0]);
  const rawArgs = legacyOpen ? args : args.slice(1);
  const decoded = methodName === "open" ? [...rawArgs] : decodeArgs(rawArgs);
  const reference = legacyOpen
    ? ({ kind: "uxp.remote.ref", type: PHOTOSHOP_REMOTE_TYPE.Photoshop, id: PHOTOSHOP_APP_REFERENCE_ID } as RemoteReference)
    : expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method)[0];
  if (methodName === "getColorProfiles") {
    expectArgs(decoded, 0, 1, method);
    if (decoded[0] !== undefined) assertString(decoded[0], `${method} colorMode`);
    const app = getPhotoshopApp(reference);
    return callMethod(app, methodName, decoded);
  }
  if (methodName === "convertUnits") {
    expectArgs(decoded, 3, 4, method);
    decoded.forEach((value, index) => {
      if ((index === 0 || index === 3) && value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${method} numeric argument is invalid.`);
      if ((index === 1 || index === 2) && typeof value !== "string") throw new Error(`${method} unit argument is invalid.`);
    });
    const app = getPhotoshopApp(reference);
    return callMethod(app, methodName, decoded);
  }
  if (methodName === "showAlert") {
    expectArgs(decoded, 1, 1, method);
    assertString(decoded[0], `${method} message`);
    const app = getPhotoshopApp(reference);
    return resolveMaybePromise(callMethod(app, methodName, decoded), () => undefined);
  }
  if (methodName === "bringToFront" || methodName === "updateUI") {
    expectArgs(decoded, 0, 0, method);
    const app = getPhotoshopApp(reference);
    const run = executeAsModal(method, () => callMethod(app, methodName, []));
    return resolveMaybePromise(run, () => undefined);
  }
  if (methodName === "batchPlay") {
    expectArgs(decoded, 1, 2, method);
    if (!Array.isArray(decoded[0])) throw new Error(`${method} requires command descriptors.`);
    const app = getPhotoshopApp(reference);
    return executeAsModal(method, () => callMethod(app, methodName, decoded));
  }
  if (methodName === "open") {
    expectArgs(decoded, 0, 1, method);
    const nativeArgs = decoded[0] === undefined
      ? []
      : [isUxpStorageEntryReference(decoded[0]) ? resolveUxpStorageEntryReference(decoded[0], "file") : decodeValue(decoded[0])];
    const app = getPhotoshopApp(reference);
    const run = executeAsModal(method, () => callMethod(app, methodName, nativeArgs));
    return resolveMaybePromise(run, (document) => document == null ? null : serializeDocument(document as PhotoshopDocumentLike));
  }
  if (methodName === "createDocument") {
    expectArgs(decoded, 0, 1, method);
    const nativeArgs = decoded[0] === undefined ? [] : [decodeDocumentCreateOptions(decoded[0])];
    const app = getPhotoshopApp(reference);
    const run = executeAsModal(method, () => callMethod(app, methodName, nativeArgs));
    return resolveMaybePromise(run, (document) => document == null ? null : serializeDocument(document as PhotoshopDocumentLike));
  }
  throw new Error(`Unsupported photoshop app method: ${method}`);
}

function serializeAppProperty(reference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Photoshop, name);
  if (resultKind.kind === "scalar" && !APP_SCALARS.has(name)) throw new Error(`Unknown Photoshop property: ${name}`);
  return serializeResult(resultKind, reference, value);
}

function decodeDocumentCreateOptions(value: unknown): unknown {
  if (value === undefined) return undefined;
  const options = assertObjectRecord(value, "DocumentCreateOptions");
  return { ...options, ...(options.fillColor === undefined ? {} : { fillColor: buildSolidColor(decodeValue(options.fillColor)) }) };
}

// ---------------------------------------------------------------------------- app-owned collections and objects

function dispatchDocumentsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const [reference, value] = expectReferenceArgs(args, 1, 2, method);
  const app = getPhotoshopApp(reference);
  if (method === "documents.getByName") {
    const name = assertString(value, `${method} name`);
    const match = getMemberArray(app.documents).find((entry) => (entry as PhotoshopDocumentLike).name === name);
    return match == null ? null : serializeDocument(match as PhotoshopDocumentLike);
  }
  if (method === "documents.add") {
    const options = value === undefined ? undefined : decodeDocumentCreateOptions(decodeValue(value));
    const documents = app.documents as unknown;
    const target = typeof (documents as Record<string, unknown>)?.add === "function" ? documents : app;
    const nativeMethod = target === documents ? "add" : "createDocument";
    const run = executeAsModal(method, () => callMethod(target, nativeMethod, options === undefined ? [] : [options]));
    return resolveMaybePromise(run, (document) => document == null ? null : serializeDocument(document as PhotoshopDocumentLike));
  }
  throw new Error(`Unsupported photoshop documents method: ${method}`);
}

function dispatchTextFontsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  const [reference, value] = expectReferenceArgs(args, 2, 2, method);
  const app = getPhotoshopApp(reference);
  const name = assertString(value, `${method} name`);
  const match = getMemberArray(app.fonts).find((entry) => (entry as PhotoshopTextFontLike).postScriptName === name);
  return match == null ? null : serializeTextFont(match as PhotoshopTextFontLike);
}

function dispatchTextFontCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  return dispatchSimpleObjectCall(PHOTOSHOP_REMOTE_TYPE.TextFont, method, args, TEXT_FONT_SCALARS, new Set());
}

function dispatchToolCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  return dispatchSimpleObjectCall(PHOTOSHOP_REMOTE_TYPE.Tool, method, args, TOOL_SCALARS, new Set(["id"]));
}

function dispatchActionObjectCall(
  type: typeof PHOTOSHOP_REMOTE_TYPE.ActionSet | typeof PHOTOSHOP_REMOTE_TYPE.Action,
  method: PhotoshopProtocolMethodName,
  args: readonly unknown[]
): unknown | Promise<unknown> {
  const prefix = type === PHOTOSHOP_REMOTE_TYPE.ActionSet ? "actionSet" : "actionObject";
  const scalars = type === PHOTOSHOP_REMOTE_TYPE.ActionSet ? ACTION_SET_SCALARS : ACTION_SCALARS;
  if (method === `${prefix}.dispose`) {
    const [reference] = expectReferenceArgs(args, 1, 1, method); photoshopRegistry.dispose(reference); return undefined;
  }
  if (method === `${prefix}.propertyGet` || method === `${prefix}.batchGet`) {
    return dispatchSimpleObjectCall(type, method, args, scalars, new Set(["name"]));
  }
  if (method === `${prefix}.propertySet` || method === `${prefix}.batchSet`) {
    return dispatchSimpleObjectCall(type, method, args, scalars, new Set(["name"]), true);
  }
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const object = photoshopRegistry.resolve(reference, type) as Record<string, unknown>;
  const methodName = method.slice(prefix.length + 1);
  if (!new Set(["delete", "duplicate", "play"]).has(methodName)) return unsupported(method);
  const run = executeAsModal(method, () => callMethod(object, methodName, decodeArgs(rest)));
  return resolveMaybePromise(run, (value) => serializeResult(photoshopMethodResultKind(type, methodName), reference, value));
}

function dispatchPreferencesCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const reference = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method)[0];
  if (!isPhotoshopPreferenceType(reference.type)) throw new Error(`Expected a Preferences reference, received ${reference.type}.`);
  const readable = preferenceReadableProperties(reference.type);
  const writable = reference.type === PHOTOSHOP_REMOTE_TYPE.Preferences
    ? new Set<string>()
    : new Set(PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES[reference.type as PhotoshopPreferenceCategoryType]);
  return dispatchSimpleObjectCall(reference.type, method, args, readable, writable, true);
}

function preferenceReadableProperties(type: string): Set<string> {
  if (type === PHOTOSHOP_REMOTE_TYPE.Preferences) return new Set(["typename", ...Object.keys(PHOTOSHOP_PREFERENCE_ROOT_PROPERTIES)]);
  return new Set(["typename", ...PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES[type as PhotoshopPreferenceCategoryType]]);
}

function dispatchSimpleObjectCall(
  type: string,
  method: PhotoshopProtocolMethodName,
  args: readonly unknown[],
  readable: ReadonlySet<string>,
  writable: ReadonlySet<string>,
  modalWrites = false
): unknown | Promise<unknown> {
  const suffix = method.slice(method.lastIndexOf(".") + 1);
  if (suffix === "dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method); photoshopRegistry.dispose(reference); return undefined;
  }
  const [reference, value, next] = expectReferenceArgs(args, 2, 3, method);
  const object = photoshopRegistry.resolve(reference, type) as Record<string, unknown>;
  if (suffix === "propertyGet") {
    const name = assertString(value, `${method} property`);
    if (!readable.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
    const propertyValue = name === "typename" && object[name] === undefined ? type : object[name];
    return serializeResult(photoshopPropertyResultKind(type, name), reference, propertyValue);
  }
  if (suffix === "propertySet") {
    const name = assertString(value, `${method} property`);
    if (!writable.has(name)) throw new Error(`${type} property is not writable: ${name}`);
    const assign = () => { object[name] = decodeValue(next); };
    return modalWrites ? executeAsModal(method, assign) : assign();
  }
  if (suffix === "batchGet") {
    const names = assertStringArray(value, method);
    return Object.fromEntries(names.map((name) => {
      if (!readable.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
      const propertyValue = name === "typename" && object[name] === undefined ? type : object[name];
      return [name, serializeResult(photoshopPropertyResultKind(type, name), reference, propertyValue)];
    }));
  }
  if (suffix === "batchSet") {
    const props = assertPropertyMap(value, method);
    for (const name of Object.keys(props)) if (!writable.has(name)) throw new Error(`${type} property is not writable: ${name}`);
    const assign = () => { for (const [name, entry] of Object.entries(props)) object[name] = decodeValue(entry); };
    return modalWrites ? executeAsModal(method, assign) : assign();
  }
  return unsupported(method);
}

// ---------------------------------------------------------------------------- document.*

function dispatchDocumentCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method.startsWith("document.saveAs.")) {
    const [reference, entry, options, asCopy] = expectReferenceArgs(args, 2, 4, method);
    if (!isUxpStorageEntryReference(entry)) throw new Error(`${method} entry must be a UXP storage File reference.`);
    const format = method.slice("document.saveAs.".length);
    if (!new Set(["bmp", "gif", "jpg", "png", "psb", "psd"]).has(format)) return unsupported(method);
    if (asCopy !== undefined && typeof asCopy !== "boolean") throw new Error(`${method} asCopy must be a boolean.`);
    const document = getDocument(reference);
    const saveAs = document.saveAs;
    const nativeArgs = [
      resolveUxpStorageEntryReference(entry, "file"),
      options === undefined ? undefined : decodeSaveOptions(options),
      asCopy
    ];
    while (nativeArgs[nativeArgs.length - 1] === undefined) nativeArgs.pop();
    return resolveMaybePromise(executeAsModal(method, () => callMethod(saveAs, format, nativeArgs)), () => undefined);
  }

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
    if (!DOCUMENT_WRITABLE_SCALARS.has(name) && !DOCUMENT_WRITABLE_REFS.has(name) && !DOCUMENT_WRITABLE_COLLECTIONS.has(name)) {
      throw new Error(`Document property is not writable: ${name}`);
    }
    const document = getDocument(reference);
    const decoded = decodeDocumentPropertyValue(name, value, method);
    if (name !== "pixelAspectRatio") {
      return executeAsModal(`document.set.${name}`, () => {
        document[name] = decoded;
        return undefined;
      });
    }
    document[name] = decoded;
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
      if (!DOCUMENT_WRITABLE_SCALARS.has(name) && !DOCUMENT_WRITABLE_REFS.has(name) && !DOCUMENT_WRITABLE_COLLECTIONS.has(name)) {
        throw new Error(`Document property is not writable: ${name}`);
      }
    }
    const apply = () => {
      for (const name of Object.keys(props)) {
        document[name] = decodeDocumentPropertyValue(name, props[name], method);
      }
      return undefined;
    };
    return Object.keys(props).some((name) => name !== "pixelAspectRatio")
      ? executeAsModal("document.batchSet", apply)
      : apply();
  }

  // Methods
  const methodName = method.slice("document.".length);
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const document = getDocument(reference);
  const methodArgs = normalizeDocumentMethodArgs(methodName, decodeArgs(rest));

  const invoke = (): unknown => callMethod(document, methodName, methodArgs);
  const run = DOCUMENT_MUTATING_METHODS.has(methodName)
    ? executeAsModal(methodName, invoke)
    : unsupported(method);

  return resolveMaybePromise(run, (value) => serializeDocumentMethodResult(reference, methodName, value));
}

function serializeDocumentProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Document, name);
  if (resultKind.kind === "scalar" && !DOCUMENT_SCALARS.has(name)) {
    throw new Error(`Unknown document property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, name === "typename" && value === undefined ? "Document" : value);
}

function serializeDocumentMethodResult(ownerReference: RemoteReference, methodName: string, value: unknown): unknown {
  return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Document, methodName), ownerReference, value);
}

function normalizeDocumentMethodArgs(methodName: string, args: unknown[]): unknown[] {
  const first = args[0];
  if (methodName === "close" && first && typeof first === "object" && "saveDialogOptions" in first) {
    return [(first as Record<string, unknown>).saveDialogOptions];
  }
  if ((methodName === "resizeCanvas" || methodName === "resizeImage") && first && typeof first === "object") {
    const options = first as Record<string, unknown>;
    return methodName === "resizeCanvas"
      ? [options.width, options.height, options.anchor]
      : [options.width, options.height, options.resolution];
  }
  return args;
}

function decodeSaveOptions(value: unknown): unknown {
  const options = decodeValue(value);
  if (!options || typeof options !== "object") return options;
  const result = { ...(options as Record<string, unknown>) };
  for (const key of ["color", "customMatte"]) {
    if (result[key] !== undefined) result[key] = buildSolidColor(result[key]);
  }
  return result;
}

function decodeDocumentPropertyValue(name: string, value: unknown, method: string): unknown {
  if (name === "pixelAspectRatio") return assertFiniteNumber(value, `${method} ${name}`);
  if (name === "quickMaskMode" && typeof value !== "boolean") {
    throw new Error(`${method} ${name} must be a boolean.`);
  }
  if (["bitsPerChannel", "colorProfileName", "colorProfileType"].includes(name)) {
    return assertString(value, `${method} ${name}`);
  }
  if (DOCUMENT_WRITABLE_REFS.has(name)) {
    return decodeReferenceOfType(value, PHOTOSHOP_REMOTE_TYPE.HistoryState, `${method} ${name}`);
  }
  if (name === "activeLayers") {
    return decodeReferenceArrayOfType(value, PHOTOSHOP_REMOTE_TYPE.Layer, `${method} ${name}`);
  }
  if (name === "activeChannels") {
    return decodeReferenceArrayOfType(value, PHOTOSHOP_REMOTE_TYPE.Channel, `${method} ${name}`);
  }
  return decodeValue(value);
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
  const methodArgs = decodeLayerMethodArgs(methodName, rest, method);
  const run = executeAsModal(methodName, () => callMethod(layer, methodName, methodArgs));
  return resolveMaybePromise(run, (value) => serializeLayerMethodResult(reference, methodName, value));
}

function serializeLayerProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Layer, name);
  if (resultKind.kind === "scalar" && !LAYER_SCALARS.has(name)) {
    throw new Error(`Unknown layer property: ${name}`);
  }
  if (name === "textItem" && value && typeof value === "object") {
    textItemOwners.set(value as object, getLayer(ownerReference));
  }
  return serializeResult(resultKind, ownerReference, value);
}

function serializeLayerMethodResult(ownerReference: RemoteReference, methodName: string, value: unknown): unknown {
  return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Layer, methodName), ownerReference, value);
}

function decodeLayerMethodArgs(methodName: string, values: readonly unknown[], method: string): unknown[] {
  if (methodName === "applyDisplace") {
    expectArgs(values, 5, 5, method);
    if (!isUxpStorageEntryReference(values[4])) throw new Error(`${method} displacementMapFile must be a UXP storage File reference.`);
  }
  if (methodName === "applyGlassEffect" && values[5] != null && !isUxpStorageEntryReference(values[5])) {
    throw new Error(`${method} textureFile must be a UXP storage File reference.`);
  }
  const decoded = decodeArgs(values);
  if (methodName === "applyDisplace") decoded[4] = resolveUxpStorageEntryReference(values[4], "file");
  if (methodName === "applyGlassEffect" && values[5] != null) decoded[5] = resolveUxpStorageEntryReference(values[5], "file");
  return decoded;
}

// ---------------------------------------------------------------------------- text item and styles

function dispatchTextItemCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "textItem.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }
  if (method === "textItem.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    return serializeTextItemProperty(reference, name, getTextItem(reference)[name]);
  }
  if (method === "textItem.propertySet") {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    if (!TEXT_ITEM_WRITABLE.has(name)) throw new Error(`TextItem property is not writable: ${name}`);
    return executeAsModal(`textItem.set.${name}`, () => { getTextItem(reference)[name] = decodeValue(value); });
  }
  if (method === "textItem.batchGet") {
    const [reference, names] = expectReferenceArgs(args, 2, 2, method);
    const item = getTextItem(reference);
    return Object.fromEntries(assertStringArray(names, method).map((name) => [name, serializeTextItemProperty(reference, name, item[name])]));
  }
  if (method === "textItem.batchSet") {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const props = assertPropertyMap(values, method);
    for (const name of Object.keys(props)) if (!TEXT_ITEM_WRITABLE.has(name)) throw new Error(`TextItem property is not writable: ${name}`);
    return executeAsModal("textItem.batchSet", () => {
      const item = getTextItem(reference);
      for (const [name, value] of Object.entries(props)) item[name] = decodeValue(value);
    });
  }
  const name = method.slice("textItem.".length);
  if (!TEXT_ITEM_METHODS.has(name)) return unsupported(method);
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const run = executeAsModal(name, () => callMethod(getTextItem(reference), name, decodeArgs(rest)));
  return resolveMaybePromise(run, (value) => {
    if (value && typeof value === "object") {
      const owner = textItemOwners.get(getTextItem(reference) as object);
      if (owner) textItemOwners.set(value as object, owner);
    }
    return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.TextItem, name), reference, value);
  });
}

function serializeTextItemProperty(reference: RemoteReference, name: string, value: unknown): unknown {
  const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.TextItem, name);
  if (kind.kind === "scalar" && !TEXT_ITEM_SCALARS.has(name)) throw new Error(`Unknown TextItem property: ${name}`);
  if (value && typeof value === "object") {
    const owner = textItemOwners.get(getTextItem(reference) as object);
    if (owner && name === "characterStyle") characterStyleOwners.set(value as object, owner);
    if (owner && name === "paragraphStyle") paragraphStyleOwners.set(value as object, owner);
    if (owner && name === "warpStyle") textWarpStyleOwners.set(value as object, owner);
  }
  return serializeResult(kind, reference, value);
}

function dispatchTextStyleCall(
  type: typeof PHOTOSHOP_REMOTE_TYPE.CharacterStyle | typeof PHOTOSHOP_REMOTE_TYPE.ParagraphStyle | typeof PHOTOSHOP_REMOTE_TYPE.TextWarpStyle,
  prefix: "characterStyle" | "paragraphStyle" | "textWarpStyle",
  properties: ReadonlySet<string>,
  method: PhotoshopProtocolMethodName,
  args: readonly unknown[]
): unknown | Promise<unknown> {
  if (method === `${prefix}.dispose`) {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }
  if (method === `${prefix}.propertyGet`) {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    if (!properties.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
    return serializeResult(photoshopPropertyResultKind(type, name), reference, getTextStyle(type, reference)[name]);
  }
  if (method === `${prefix}.propertySet`) {
    const [reference, key, value] = expectReferenceArgs(args, 3, 3, method);
    const name = assertString(key, `${method} property`);
    if (!properties.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
    const decoded = type === PHOTOSHOP_REMOTE_TYPE.CharacterStyle && name === "color"
      ? buildSolidColor(decodeValue(value))
      : decodeValue(value);
    return executeAsModal(`${prefix}.set.${name}`, () => { getTextStyle(type, reference)[name] = decoded; });
  }
  if (method === `${prefix}.batchGet`) {
    const [reference, names] = expectReferenceArgs(args, 2, 2, method);
    const target = getTextStyle(type, reference);
    return Object.fromEntries(assertStringArray(names, method).map((name) => {
      if (!properties.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
      return [name, serializeResult(photoshopPropertyResultKind(type, name), reference, target[name])];
    }));
  }
  if (method === `${prefix}.batchSet`) {
    const [reference, values] = expectReferenceArgs(args, 2, 2, method);
    const props = assertPropertyMap(values, method);
    for (const name of Object.keys(props)) if (!properties.has(name)) throw new Error(`Unknown ${type} property: ${name}`);
    return executeAsModal(`${prefix}.batchSet`, () => {
      const target = getTextStyle(type, reference);
      for (const [name, value] of Object.entries(props)) {
        target[name] = type === PHOTOSHOP_REMOTE_TYPE.CharacterStyle && name === "color"
          ? buildSolidColor(decodeValue(value))
          : decodeValue(value);
      }
    });
  }
  if (method === `${prefix}.reset`) {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    return executeAsModal(`${prefix}.reset`, () => callMethod(getTextStyle(type, reference), "reset", []));
  }
  return unsupported(method);
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
    const decodedOptions = decodeValue(options) as Record<string, unknown> | undefined;
    const run = executeAsModal("layers.add", async () => {
      if (reference.type === PHOTOSHOP_REMOTE_TYPE.Document) {
        return callMethod(owner, "createLayer", decodedOptions === undefined ? [] : [decodedOptions]);
      }
      const layer = await callMethod(resolveOwnerLayers(reference), "add", []) as Record<string, unknown>;
      if (decodedOptions) for (const [name, value] of Object.entries(decodedOptions)) layer[name] = value;
      return layer;
    });
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

  if (method === "channels.add") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    const channels = (getDocument(reference) as Record<string, unknown>).channels;
    const run = executeAsModal("channels.add", () => callMethod(channels, "add", []));
    return resolveMaybePromise(run, (channel) => serializeChannel(channel as PhotoshopChannelLike));
  }

  if (method === "channels.removeAll") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    const channels = (getDocument(reference) as Record<string, unknown>).channels;
    return executeAsModal(method, () => callMethod(channels, "removeAll", []));
  }

  throw new Error(`Unsupported photoshop channels method: ${method}`);
}

// ---------------------------------------------------------------------------- ColorSampler(s), CountItem(s), LayerComp(s)

function dispatchColorSamplerCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "colorSampler.dispose") {
    const [ref] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(ref);
    return undefined;
  }
  const [ref, value] = expectReferenceArgs(args, 1, 2, method);
  const sampler = getColorSampler(ref);
  if (method === "colorSampler.propertyGet") {
    const name = assertString(value, `${method} property`);
    return serializeColorSamplerProperty(ref, name, colorSamplerPropertyValue(sampler, name));
  }
  if (method === "colorSampler.batchGet") {
    return Object.fromEntries(
      assertStringArray(value, method).map((name) => [
        name,
        serializeColorSamplerProperty(ref, name, colorSamplerPropertyValue(sampler, name))
      ])
    );
  }
  if (method === "colorSampler.batchSet") {
    const props = assertPropertyMap(value, method);
    const first = Object.keys(props)[0];
    throw new Error(first ? `ColorSampler property is not writable: ${first}` : "ColorSampler has no writable properties.");
  }
  const name = method.slice("colorSampler.".length);
  if (name !== "move" && name !== "remove") return unsupported(method);
  const [, ...rest] = expectReferenceArgs(args, name === "move" ? 2 : 1, name === "move" ? 2 : 1, method);
  const decoded = decodeArgs(rest);
  if (name === "move") assertPoint(decoded[0], `${method} position`);
  return resolveMaybePromise(
    executeAsModal(method, () => callMethod(sampler, name, decoded)),
    () => undefined
  );
}

function serializeColorSamplerProperty(ref: RemoteReference, name: string, value: unknown): unknown {
  const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.ColorSampler, name);
  if (kind.kind === "scalar" && !COLOR_SAMPLER_SCALARS.has(name)) {
    throw new Error(`Unknown color sampler property: ${name}`);
  }
  return serializeResult(kind, ref, value);
}

function colorSamplerPropertyValue(sampler: PhotoshopColorSamplerLike, name: string): unknown {
  const owner = colorSamplerOwners.get(sampler as object);
  if (name === "parent") return owner ?? sampler.parent;
  if (name === "docId") return sampler.docId ?? owner?.id;
  if (name === "typename") return sampler.typename ?? "ColorSampler";
  return sampler[name];
}

function dispatchColorSamplersCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const expectedLength = method === "colorSamplers.add" ? 2 : 1;
  const [ref, ...rest] = expectReferenceArgs(args, expectedLength, expectedLength, method);
  const document = getDocument(ref);
  const collection = document.colorSamplers;
  if (method === "colorSamplers.add") {
    const decoded = decodeArgs(rest);
    assertPoint(decoded[0], `${method} position`);
    return resolveMaybePromise(
      executeAsModal(method, () => callMethod(collection, "add", decoded)),
      (value) => {
        colorSamplerOwners.set(value as object, document);
        return serializeColorSampler(value as PhotoshopColorSamplerLike);
      }
    );
  }
  if (method === "colorSamplers.removeAll") {
    return executeAsModal(method, () => callMethod(collection, "removeAll", []));
  }
  return unsupported(method);
}

function dispatchCountItemCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "countItem.dispose") {
    const [ref] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(ref);
    return undefined;
  }
  const [ref, value] = expectReferenceArgs(args, 1, 2, method);
  const item = getCountItem(ref);
  if (method === "countItem.propertyGet") {
    const name = assertString(value, `${method} property`);
    return serializeCountItemProperty(ref, name, countItemPropertyValue(item, name));
  }
  if (method === "countItem.batchGet") {
    return Object.fromEntries(
      assertStringArray(value, method).map((name) => [
        name,
        serializeCountItemProperty(ref, name, countItemPropertyValue(item, name))
      ])
    );
  }
  if (method === "countItem.batchSet") {
    const props = assertPropertyMap(value, method);
    const first = Object.keys(props)[0];
    throw new Error(first ? `CountItem property is not writable: ${first}` : "CountItem has no writable properties.");
  }
  const name = method.slice("countItem.".length);
  if (name !== "move" && name !== "remove") return unsupported(method);
  const [, ...rest] = expectReferenceArgs(args, name === "move" ? 2 : 1, name === "move" ? 2 : 1, method);
  const decoded = decodeArgs(rest);
  if (name === "move") assertPoint(decoded[0], `${method} position`);
  return resolveMaybePromise(
    executeAsModal(method, () => callMethod(item, name, decoded)),
    () => undefined
  );
}

function serializeCountItemProperty(ref: RemoteReference, name: string, value: unknown): unknown {
  const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.CountItem, name);
  if (kind.kind === "scalar" && !COUNT_ITEM_SCALARS.has(name)) {
    throw new Error(`Unknown count item property: ${name}`);
  }
  if (name === "parent") return value;
  return serializeResult(kind, ref, value);
}

function countItemPropertyValue(item: PhotoshopCountItemLike, name: string): unknown {
  if (name === "typename") return item.typename ?? "CountItem";
  if (name !== "parent") return item[name];
  const document = countItemOwners.get(item as object);
  if (!document) throw new Error("CountItem parent document is unavailable.");
  const owner = serializeDocument(document);
  return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.CountItem, owner, document.countItems);
}

function dispatchCountItemsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const name = method.slice("countItems.".length);
  if (!COUNT_ITEMS_METHODS.has(name)) return unsupported(method);
  const takesArgument = name !== "removeAllFromActiveGroup" && name !== "getAll";
  const expectedLength = takesArgument ? 2 : 1;
  const [ref, ...rest] = expectReferenceArgs(args, expectedLength, expectedLength, method);
  const document = getDocument(ref);
  const collection = document.countItems;
  const decoded = decodeArgs(rest);
  if (name === "add") assertPoint(decoded[0], `${method} position`);
  if (name === "createGroup" || name === "renameActiveGroup") assertString(decoded[0], `${method} groupName`);
  if (name === "toggleActiveGroupVisibility" && typeof decoded[0] !== "boolean") {
    throw new Error(`${method} isVisible must be a boolean.`);
  }
  if (name === "removeGroupByIndex" || name === "activateGroupByIndex") {
    const index = assertFiniteNumber(decoded[0], `${method} index`);
    if (!Number.isInteger(index) || index < 0) throw new Error(`${method} index must be a non-negative integer.`);
  }
  if (name === "setActiveMarkerSize") assertNumberInRange(decoded[0], 1, 10, `${method} size`);
  if (name === "setActiveLabelSize") assertNumberInRange(decoded[0], 8, 72, `${method} size`);
  if (name === "setActiveColor") decoded[0] = buildSolidColor(decoded[0]);
  const invoke = () => callMethod(collection, name, decoded);
  const run = name === "getAll" ? invoke() : executeAsModal(method, invoke);
  return resolveMaybePromise(run, (result) => {
    if (name === "add") {
      countItemOwners.set(result as object, document);
      return serializeCountItem(result as PhotoshopCountItemLike, document);
    }
    if (name === "getAll") return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.CountItem, ref, result);
    return undefined;
  });
}

function dispatchLayerCompCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "layerComp.dispose") {
    const [ref] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(ref);
    return undefined;
  }
  const [ref, value, next] = expectReferenceArgs(args, 1, 3, method);
  const comp = getLayerComp(ref);
  if (method === "layerComp.propertyGet") {
    const name = assertString(value, `${method} property`);
    return serializeLayerCompProperty(ref, name, comp[name]);
  }
  if (method === "layerComp.propertySet") {
    const name = assertString(value, `${method} property`);
    if (!LAYER_COMP_WRITABLE.has(name)) throw new Error(`LayerComp property is not writable: ${name}`);
    const decoded = decodeLayerCompPropertyValue(name, next, method);
    return executeAsModal(method, () => { comp[name] = decoded; });
  }
  if (method === "layerComp.batchGet") {
    return Object.fromEntries(
      assertStringArray(value, method).map((name) => [name, serializeLayerCompProperty(ref, name, comp[name])])
    );
  }
  if (method === "layerComp.batchSet") {
    const props = assertPropertyMap(value, method);
    for (const name of Object.keys(props)) {
      if (!LAYER_COMP_WRITABLE.has(name)) throw new Error(`LayerComp property is not writable: ${name}`);
    }
    const decoded = Object.fromEntries(
      Object.entries(props).map(([name, entry]) => [name, decodeLayerCompPropertyValue(name, entry, method)])
    );
    return executeAsModal(method, () => {
      for (const [name, entry] of Object.entries(decoded)) comp[name] = entry;
    });
  }
  const name = method.slice("layerComp.".length);
  if (!LAYER_COMP_METHODS.has(name)) return unsupported(method);
  const [, ...rest] = expectReferenceArgs(args, 1, name === "recapture" ? 3 : 1, method);
  const run = executeAsModal(method, () => callMethod(comp, name, decodeArgs(rest)));
  return resolveMaybePromise(run, (result) =>
    serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.LayerComp, name), ref, result)
  );
}

function serializeLayerCompProperty(ref: RemoteReference, name: string, value: unknown): unknown {
  const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.LayerComp, name);
  if (kind.kind === "scalar" && !LAYER_COMP_SCALARS.has(name)) {
    throw new Error(`Unknown layer comp property: ${name}`);
  }
  if (name === "typename" && value === undefined) value = "LayerComp";
  return serializeResult(kind, ref, value);
}

function decodeLayerCompPropertyValue(name: string, value: unknown, method: string): unknown {
  if (name === "name") return assertString(value, `${method} ${name}`);
  if (name === "comment") {
    if (value !== null && typeof value !== "string") {
      throw new Error(`${method} ${name} must be a string or null.`);
    }
    return value;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${method} ${name} must be a boolean.`);
  }
  return value;
}

function dispatchLayerCompsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const name = method.slice("layerComps.".length);
  if (!LAYER_COMPS_METHODS.has(name)) return unsupported(method);
  const minLength = name === "getAllByName" ? 2 : 1;
  const maxLength = name === "add" || name === "getAllByName" ? 2 : 1;
  const [ref, ...rest] = expectReferenceArgs(args, minLength, maxLength, method);
  const document = getDocument(ref);
  const collection = document.layerComps;
  if (name === "getAllByName") assertString(rest[0], `${method} name`);
  const invoke = () => callMethod(collection, name, decodeArgs(rest));
  const run = name === "getAllByName" ? invoke() : executeAsModal(method, invoke);
  return resolveMaybePromise(run, (result) => {
    if (name === "add") return serializeLayerComp(result as PhotoshopLayerCompLike, document);
    if (name === "getAllByName") return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.LayerComp, ref, result);
    return undefined;
  });
}

// ---------------------------------------------------------------------------- selection.*

function dispatchSelectionCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "selection.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }

  if (method === "selection.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    return serializeSelectionProperty(reference, name, getSelection(reference)[name]);
  }

  if (method === "selection.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const selection = getSelection(reference);
    const result: Record<string, unknown> = {};
    for (const name of assertStringArray(propertyNames, method)) {
      result[name] = serializeSelectionProperty(reference, name, selection[name]);
    }
    return result;
  }

  if (method === "selection.batchSet") {
    const [, values] = expectReferenceArgs(args, 2, 2, method);
    const props = assertPropertyMap(values, method);
    const first = Object.keys(props)[0];
    throw new Error(first ? `Selection property is not writable: ${first}` : "Selection has no writable properties.");
  }

  const methodName = method.slice("selection.".length);
  if (!SELECTION_MUTATING_METHODS.has(methodName)) {
    return unsupported(method);
  }
  const [reference, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method);
  const selection = getSelection(reference);
  const run = executeAsModal(methodName, () => callMethod(selection, methodName, decodeArgs(rest)));
  return resolveMaybePromise(run, (value) => {
    if (methodName === "makeWorkPath" && value && typeof value === "object") {
      const parent = selection.parent as PhotoshopDocumentLike | undefined;
      if (parent?.id !== undefined) pathItemOwners.set(value, parent);
    }
    return serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.Selection, methodName), reference, value);
  });
}

function serializeSelectionProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Selection, name);
  if (resultKind.kind === "scalar" && !SELECTION_SCALARS.has(name)) {
    throw new Error(`Unknown selection property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, value);
}

// ---------------------------------------------------------------------------- historyState(s).*

function dispatchHistoryStateCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  if (method === "historyState.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    photoshopRegistry.dispose(reference);
    return undefined;
  }

  if (method === "historyState.propertyGet") {
    const [reference, key] = expectReferenceArgs(args, 2, 2, method);
    const name = assertString(key, `${method} property`);
    return serializeHistoryStateProperty(reference, name, getHistoryState(reference)[name]);
  }

  if (method === "historyState.batchGet") {
    const [reference, propertyNames] = expectReferenceArgs(args, 2, 2, method);
    const historyState = getHistoryState(reference);
    const result: Record<string, unknown> = {};
    for (const name of assertStringArray(propertyNames, method)) {
      result[name] = serializeHistoryStateProperty(reference, name, historyState[name]);
    }
    return result;
  }

  if (method === "historyState.batchSet") {
    const [, values] = expectReferenceArgs(args, 2, 2, method);
    const props = assertPropertyMap(values, method);
    const first = Object.keys(props)[0];
    throw new Error(first ? `HistoryState property is not writable: ${first}` : "HistoryState has no writable properties.");
  }

  return unsupported(method);
}

function serializeHistoryStateProperty(ownerReference: RemoteReference, name: string, value: unknown): unknown {
  const resultKind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.HistoryState, name);
  if (resultKind.kind === "scalar" && !HISTORY_STATE_SCALARS.has(name)) {
    throw new Error(`Unknown history state property: ${name}`);
  }
  return serializeResult(resultKind, ownerReference, value);
}

function dispatchHistoryStatesCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  if (method === "historyStates.snapshot") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    return serializeSnapshot(
      PHOTOSHOP_REMOTE_TYPE.HistoryState,
      reference,
      (getDocument(reference) as Record<string, unknown>).historyStates
    );
  }

  if (method === "historyStates.getByName") {
    const [reference, name] = expectReferenceArgs(args, 2, 2, method);
    const targetName = assertString(name, `${method} name`);
    const members = getMemberArray((getDocument(reference) as Record<string, unknown>).historyStates);
    const match = members.find((entry) => (entry as PhotoshopHistoryStateLike).name === targetName);
    return match == null ? null : serializeHistoryState(match as PhotoshopHistoryStateLike);
  }

  return unsupported(method);
}

// ---------------------------------------------------------------------------- guide/path geometry

function dispatchGuideCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "guide.dispose") { const [ref] = expectReferenceArgs(args, 1, 1, method); photoshopRegistry.dispose(ref); return undefined; }
  if (method === "guide.propertyGet") { const [ref, key] = expectReferenceArgs(args, 2, 2, method); const name = assertString(key, `${method} property`); return serializeGuideProperty(ref, name, getGuide(ref)[name]); }
  if (method === "guide.propertySet") { const [ref, key, value] = expectReferenceArgs(args, 3, 3, method); const name = assertString(key, `${method} property`); if (name !== "direction" && name !== "coordinate") throw new Error(`Guide property is not writable: ${name}`); return executeAsModal(`guide.set.${name}`, () => { getGuide(ref)[name] = decodeValue(value); }); }
  if (method === "guide.batchGet") { const [ref, names] = expectReferenceArgs(args, 2, 2, method); const guide = getGuide(ref); return Object.fromEntries(assertStringArray(names, method).map((name) => [name, serializeGuideProperty(ref, name, guide[name])])); }
  if (method === "guide.batchSet") { const [ref, values] = expectReferenceArgs(args, 2, 2, method); const props = assertPropertyMap(values, method); for (const name of Object.keys(props)) if (name !== "direction" && name !== "coordinate") throw new Error(`Guide property is not writable: ${name}`); return executeAsModal("guide.batchSet", () => { const guide = getGuide(ref); for (const [name, value] of Object.entries(props)) guide[name] = decodeValue(value); }); }
  if (method === "guide.delete") { const [ref] = expectReferenceArgs(args, 1, 1, method); return executeAsModal("guide.delete", () => callMethod(getGuide(ref), "delete", [])); }
  return unsupported(method);
}

function serializeGuideProperty(ref: RemoteReference, name: string, value: unknown): unknown { const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.Guide, name); if (kind.kind === "scalar" && !GUIDE_SCALARS.has(name)) throw new Error(`Unknown guide property: ${name}`); return serializeResult(kind, ref, value); }

function dispatchGuidesCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const [ref, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method); const guides = (getDocument(ref) as Record<string, unknown>).guides;
  if (method === "guides.snapshot") return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.Guide, ref, guides);
  if (method === "guides.add") return resolveMaybePromise(executeAsModal("guides.add", () => callMethod(guides, "add", decodeArgs(rest))), (value) => serializeGuide(value as PhotoshopGuideLike));
  if (method === "guides.removeAll") return executeAsModal("guides.removeAll", () => callMethod(guides, "removeAll", []));
  return unsupported(method);
}

function dispatchPathItemsCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  const [ref, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method); const paths = (getDocument(ref) as Record<string, unknown>).pathItems;
  if (method === "pathItems.snapshot") return serializeSnapshot(PHOTOSHOP_REMOTE_TYPE.PathItem, ref, paths);
  if (method === "pathItems.getByName") { const name = assertString(rest[0], `${method} name`); const found = getMemberArray(paths).find((item) => (item as PhotoshopPathItemLike).name === name); if (found == null) return null; pathItemOwners.set(found as object, getDocument(ref)); return serializePathItem(found as PhotoshopPathItemLike); }
  if (method === "pathItems.add") { const name = assertString(rest[0], `${method} name`); const infos = buildSubPathInfos(rest[1]); return resolveMaybePromise(executeAsModal("pathItems.add", () => callMethod(paths, "add", [name, infos])), () => { const value = getMemberArray(paths).find((item) => (item as PhotoshopPathItemLike).name === name); if (!value) throw new Error(`pathItems.add did not create ${name}.`); pathItemOwners.set(value as object, getDocument(ref)); rememberPathGeometry(value as PhotoshopPathItemLike, rest[1]); return serializePathItem(value as PhotoshopPathItemLike); }); }
  if (method === "pathItems.removeAll") return executeAsModal("pathItems.removeAll", () => callMethod(paths, "removeAll", []));
  return unsupported(method);
}

function dispatchPathItemCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "pathItem.dispose") { const [ref] = expectReferenceArgs(args, 1, 1, method); photoshopRegistry.dispose(ref); return undefined; }
  if (method === "pathItem.propertyGet") { const [ref, key] = expectReferenceArgs(args, 2, 2, method); const name = assertString(key, `${method} property`); const item = getPathItem(ref); return serializePathItemProperty(ref, name, pathItemPropertyValue(item, name)); }
  if (method === "pathItem.propertySet") { const [ref, key, value] = expectReferenceArgs(args, 3, 3, method); const name = assertString(key, `${method} property`); if (name !== "kind" && name !== "name") throw new Error(`PathItem property is not writable: ${name}`); return executeAsModal(`pathItem.set.${name}`, () => { getPathItem(ref)[name] = decodeValue(value); }); }
  if (method === "pathItem.batchGet") { const [ref, names] = expectReferenceArgs(args, 2, 2, method); const item = getPathItem(ref); return Object.fromEntries(assertStringArray(names, method).map((name) => [name, serializePathItemProperty(ref, name, pathItemPropertyValue(item, name))])); }
  if (method === "pathItem.batchSet") { const [ref, values] = expectReferenceArgs(args, 2, 2, method); const props = assertPropertyMap(values, method); for (const name of Object.keys(props)) if (name !== "kind" && name !== "name") throw new Error(`PathItem property is not writable: ${name}`); return executeAsModal("pathItem.batchSet", () => { const item = getPathItem(ref); for (const [name, value] of Object.entries(props)) item[name] = decodeValue(value); }); }
  const name = method.slice("pathItem.".length); if (!PATH_ITEM_METHODS.has(name)) return unsupported(method); const [ref, ...rest] = expectReferenceArgs(args, 1, Number.POSITIVE_INFINITY, method); const decoded = decodeArgs(rest); if (name === "fillPath" && decoded[0] != null) decoded[0] = buildSolidColor(decoded[0]);
  const run = executeAsModal(name, () => callMethod(getPathItem(ref), name, decoded)); return resolveMaybePromise(run, (value) => serializeResult(photoshopMethodResultKind(PHOTOSHOP_REMOTE_TYPE.PathItem, name), ref, value));
}

function serializePathItemProperty(ref: RemoteReference, name: string, value: unknown): unknown { const kind = photoshopPropertyResultKind(PHOTOSHOP_REMOTE_TYPE.PathItem, name); if (kind.kind === "scalar" && !PATH_ITEM_SCALARS.has(name)) throw new Error(`Unknown path item property: ${name}`); return serializeResult(kind, ref, value); }

function pathItemPropertyValue(item: PhotoshopPathItemLike, name: string): unknown {
  if (name === "subPathItems" && item[name] === undefined) return pathItemGeometry.get(item as object);
  if (name !== "parent") return item[name];
  const knownOwner = pathItemOwners.get(item as object);
  if (knownOwner) return knownOwner;
  const documents = getPhotoshop().app.documents;
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    if (document?.id === item.docId) return document;
  }
  throw new Error(`PathItem parent document is unavailable: ${item.docId}`);
}

function dispatchReadonlyPathObjectCall(type: "SubPathItem" | "PathPoint", method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown {
  const prefix = type === PHOTOSHOP_REMOTE_TYPE.SubPathItem ? "subPathItem" : "pathPoint"; const scalars = type === PHOTOSHOP_REMOTE_TYPE.SubPathItem ? SUB_PATH_ITEM_SCALARS : PATH_POINT_SCALARS;
  if (method === `${prefix}.dispose`) { const [ref] = expectReferenceArgs(args, 1, 1, method); photoshopRegistry.dispose(ref); return undefined; }
  const [ref, value] = expectReferenceArgs(args, 2, 2, method); const object = photoshopRegistry.resolve(ref, type) as Record<string, unknown>;
  if (method === `${prefix}.batchSet`) { const props = assertPropertyMap(value, method); const first = Object.keys(props)[0]; throw new Error(first ? `${type} property is not writable: ${first}` : `${type} has no writable properties.`); }
  const names = method === `${prefix}.propertyGet` ? [assertString(value, `${method} property`)] : assertStringArray(value, method); const result = Object.fromEntries(names.map((name) => { const kind = photoshopPropertyResultKind(type, name); if (kind.kind === "scalar" && !scalars.has(name)) throw new Error(`Unknown ${prefix} property: ${name}`); return [name, serializeResult(kind, ref, object[name])]; })); return method.endsWith("propertyGet") ? result[names[0]!] : result;
}

function buildSubPathInfos(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("pathItems.add entirePath must be an array."); const app = getPhotoshop().app as Record<string, unknown>; const SubPathInfo = app.SubPathInfo as { new(): Record<string, unknown> } | undefined; const PathPointInfo = app.PathPointInfo as { new(): Record<string, unknown> } | undefined; return value.map((raw) => { const source = assertObjectRecord(raw, "SubPathInfo"); const info = SubPathInfo ? new SubPathInfo() : {}; info.closed = source.closed; info.operation = source.operation; if (!Array.isArray(source.entireSubPath)) throw new Error("SubPathInfo.entireSubPath must be an array."); info.entireSubPath = source.entireSubPath.map((point) => { const pointSource = assertObjectRecord(point, "PathPointInfo"); const result = PathPointInfo ? new PathPointInfo() : {}; Object.assign(result, pointSource); return result; }); return info; }); }

const pathItemGeometry = new WeakMap<object, readonly Record<string, unknown>[]>();
function rememberPathGeometry(pathItem: PhotoshopPathItemLike, value: unknown): void {
  if (!Array.isArray(value)) return;
  const subPaths = value.map((raw) => {
    const source = assertObjectRecord(raw, "SubPathInfo");
    const subPath: Record<string, unknown> = {
      typename: "SubPathItem",
      parent: pathItem,
      operation: source.operation,
      closed: source.closed
    };
    const points = Array.isArray(source.entireSubPath)
      ? source.entireSubPath.map((rawPoint) => ({
          ...assertObjectRecord(rawPoint, "PathPointInfo"),
          typename: "PathPoint",
          parent: subPath
        }))
      : [];
    subPath.pathPoints = points;
    return subPath;
  });
  pathItemGeometry.set(pathItem as object, subPaths);
}

// ---------------------------------------------------------------------------- action.*

/**
 * Low-level action dispatch (ADR 0010). Descriptors/references are opaque native JSON: the host
 * validates their outer shape but never walks, bridge-decodes, or result-serializes them (doing so
 * would corrupt `_ref`/`_id` values in Photoshop's own id space). Batch execution enters a modal
 * scope; id/reference helpers and action-recording metadata calls execute directly.
 */
function dispatchActionCall(method: PhotoshopProtocolMethodName, args: readonly unknown[]): unknown | Promise<unknown> {
  if (method === "action.getIDFromString") {
    expectArgs(args, 1, 1, method);
    const value = assertString(args[0], `${method} value`);
    const result = callMethod(getPhotoshop().action, "getIDFromString", [value]);
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error(`${method} returned a non-finite number.`);
    }
    return result;
  }

  if (method === "action.validateReference") {
    expectArgs(args, 1, 1, method);
    const reference = assertActionReference(args[0], method);
    const result = callMethod(getActionCompatibilityTarget("validateReference"), "validateReference", [reference]);
    if (typeof result !== "boolean") {
      throw new Error(`${method} returned a non-boolean value.`);
    }
    return result;
  }

  if (method === "action.recordAction") {
    expectArgs(args, 2, 2, method);
    const options = assertRecordActionOptions(args[0], method);
    const info = assertObjectRecord(args[1], `${method} info`);
    const result = callMethod(getPhotoshop().action, "recordAction", [options, info]);
    return resolveMaybePromise(result, () => undefined);
  }

  if (method !== "action.batchPlay" && method !== "action.batchPlaySync") {
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
  // Photoshop 26.10's native binding rejects both an omitted second argument and explicit
  // `undefined`, despite the public TypeScript signature marking options optional.
  if (method === "action.batchPlaySync") {
    return executeAsModal(commandName, () => {
      const nativeTarget = getOptionalActionCompatibilityTarget("batchPlaySync");
      if (nativeTarget) {
        return callMethod(nativeTarget, "batchPlaySync", [commands, commandOptions ?? {}]);
      }
      // Photoshop 26.10 exposes no native batchPlaySync on action or core. Across the bridge the
      // public method must return a Promise anyway, so preserve command execution semantics by
      // forcing the supported batchPlay API into synchronous-execution mode.
      return getPhotoshop().action.batchPlay(commands, {
        ...commandOptions,
        synchronousExecution: true
      });
    });
  }
  return executeAsModal(commandName, () => getPhotoshop().action.batchPlay(commands, commandOptions ?? {}));
}

/**
 * `photoshopaction.md` documents these methods under `action`, while the bundled changelog assigns
 * them to `core`; runtime ownership also varies by version. Prefer the documented owner, then the
 * changelog owner. `batchPlaySync` has a separate emulation fallback when neither owner exposes it.
 */
function getActionCompatibilityTarget(methodName: "batchPlaySync" | "validateReference"): unknown {
  const target = getOptionalActionCompatibilityTarget(methodName);
  if (target) {
    return target;
  }
  throw new Error(`photoshop action/core does not implement ${methodName}.`);
}

function getOptionalActionCompatibilityTarget(
  methodName: "batchPlaySync" | "validateReference"
): unknown | undefined {
  const photoshop = getPhotoshop();
  if (typeof photoshop.action[methodName] === "function") {
    return photoshop.action;
  }
  if (typeof photoshop.core[methodName] === "function") {
    return photoshop.core;
  }
  return undefined;
}

function assertActionReference(
  value: unknown,
  method: string
): Record<string, unknown> | readonly Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => assertObjectRecord(entry, `${method} reference[${index}]`));
  }
  return assertObjectRecord(value, `${method} reference`);
}

function assertRecordActionOptions(
  value: unknown,
  method: string
): { readonly name: string; readonly methodName: string } {
  const options = assertObjectRecord(value, `${method} options`);
  return {
    name: assertString(options.name, `${method} options.name`),
    methodName: assertString(options.methodName, `${method} options.methodName`)
  };
}

function assertObjectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
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
  const key = `${PHOTOSHOP_REMOTE_TYPE.Layer}:${layerIdentityKey(layer)}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Layer, key, () => layer);
}

function layerIdentityKey(layer: PhotoshopLayerLike): string {
  const nativeDocument = layer.document as PhotoshopDocumentLike | undefined;
  const documentId = nativeDocument && typeof nativeDocument.id === "number"
    ? nativeDocument.id
    : typeof layer._docId === "number" ? layer._docId : "unknown";
  return `${documentId}:${layer.id}`;
}

/**
 * Serialize a native `Channel`. Unlike Document/Layer, a Channel has no stable DOM id, so identity
 * is non-deduped (RFC-0011 OQ#1): `register` mints a fresh unique handle id per read, and two reads
 * of the same channel yield distinct references with no `===` guarantee on the WebView side.
 */
function serializeChannel(channel: PhotoshopChannelLike): RemoteReference {
  return photoshopRegistry.register(PHOTOSHOP_REMOTE_TYPE.Channel, channel);
}

const colorSamplerOwners = new WeakMap<object, PhotoshopDocumentLike>();
const countItemOwners = new WeakMap<object, PhotoshopDocumentLike>();
const layerCompOwners = new WeakMap<object, PhotoshopDocumentLike>();
const textItemOwners = new WeakMap<object, PhotoshopLayerLike>();
const characterStyleOwners = new WeakMap<object, PhotoshopLayerLike>();
const paragraphStyleOwners = new WeakMap<object, PhotoshopLayerLike>();
const textWarpStyleOwners = new WeakMap<object, PhotoshopLayerLike>();

function serializeColorSampler(value: PhotoshopColorSamplerLike): RemoteReference {
  return photoshopRegistry.register(PHOTOSHOP_REMOTE_TYPE.ColorSampler, value);
}

function serializeCountItem(value: PhotoshopCountItemLike, owner?: PhotoshopDocumentLike): RemoteReference {
  const document = owner ?? countItemOwners.get(value as object);
  if (document) countItemOwners.set(value as object, document);
  const key = `${PHOTOSHOP_REMOTE_TYPE.CountItem}:${document?.id ?? "unknown"}:${value.groupIndex}:${value.itemIndex}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.CountItem, key, () => value);
}

function serializeLayerComp(value: PhotoshopLayerCompLike, owner?: PhotoshopDocumentLike): RemoteReference {
  const document = owner ?? layerCompOwners.get(value as object);
  if (document) layerCompOwners.set(value as object, document);
  const docId = value.docId ?? document?.id;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.LayerComp, `LayerComp:${docId}:${value.id}`, () => value);
}

function serializePhotoshop(app: PhotoshopApp): RemoteReference {
  void app;
  return { kind: "uxp.remote.ref", type: PHOTOSHOP_REMOTE_TYPE.Photoshop, id: PHOTOSHOP_APP_REFERENCE_ID };
}

function serializeTextFont(font: PhotoshopTextFontLike): RemoteReference {
  const key = `${PHOTOSHOP_REMOTE_TYPE.TextFont}:${font.postScriptName ?? geometryKey("TextFont", font)}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.TextFont, key, () => font);
}

function serializeTextItem(value: PhotoshopTextItemLike, owner?: PhotoshopLayerLike): RemoteReference {
  const layer = owner ?? textItemOwners.get(value as object) ?? value.parent as PhotoshopLayerLike | undefined;
  if (!layer || typeof layer.id !== "number") throw new Error("TextItem owner Layer is unavailable.");
  textItemOwners.set(value as object, layer);
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.TextItem, `TextItem:${layerIdentityKey(layer)}`, () => value);
}

function serializeTextStyle(
  type: typeof PHOTOSHOP_REMOTE_TYPE.CharacterStyle | typeof PHOTOSHOP_REMOTE_TYPE.ParagraphStyle | typeof PHOTOSHOP_REMOTE_TYPE.TextWarpStyle,
  value: PhotoshopCharacterStyleLike | PhotoshopParagraphStyleLike | PhotoshopTextWarpStyleLike
): RemoteReference {
  const owners = type === PHOTOSHOP_REMOTE_TYPE.CharacterStyle
    ? characterStyleOwners
    : type === PHOTOSHOP_REMOTE_TYPE.ParagraphStyle ? paragraphStyleOwners : textWarpStyleOwners;
  const layer = owners.get(value as object);
  if (!layer) throw new Error(`${type} owner Layer is unavailable.`);
  return photoshopRegistry.getOrCreate(type, `${type}:${layerIdentityKey(layer)}`, () => value);
}

function serializeTool(tool: PhotoshopToolLike): RemoteReference {
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Tool, "Tool:current", () => tool);
}

function serializeActionSet(value: PhotoshopActionSetLike): RemoteReference {
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.ActionSet, `ActionSet:${value.id}`, () => value);
}

function serializeAction(value: PhotoshopActionLike): RemoteReference {
  const parent = value.parent as PhotoshopActionSetLike | undefined;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Action, `Action:${parent?.id ?? "unknown"}:${value.id}`, () => value);
}

function serializePreference(type: string, value: PhotoshopPreferencesLike): RemoteReference {
  return photoshopRegistry.getOrCreate(type, `Preference:${type}`, () => value);
}

function serializeSelection(selection: PhotoshopSelectionLike): RemoteReference {
  const key = `${PHOTOSHOP_REMOTE_TYPE.Selection}:${selection.docId}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Selection, key, () => selection);
}

function serializeHistoryState(historyState: PhotoshopHistoryStateLike): RemoteReference {
  const key = `${PHOTOSHOP_REMOTE_TYPE.HistoryState}:${historyState.docId}:${historyState.id}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.HistoryState, key, () => historyState);
}

function serializeGuide(guide: PhotoshopGuideLike): RemoteReference {
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.Guide, `Guide:${guide.docId}:${guide.id}`, () => guide);
}

function serializePathItem(pathItem: PhotoshopPathItemLike): RemoteReference {
  const owner = pathItemOwners.get(pathItem as object);
  const record = pathItem as Record<string, unknown>;
  const documentId = pathItem.docId ?? record._docId ?? owner?.id;
  const pathId = pathItem.id ?? record._id ?? record.name ?? geometryKey("PathItem", pathItem);
  const key = `${PHOTOSHOP_REMOTE_TYPE.PathItem}:${documentId}:${pathId}`;
  return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.PathItem, key, () => pathItem);
}

const pathItemOwners = new WeakMap<object, PhotoshopDocumentLike>();

const geometryKeys = new WeakMap<object, string>();
let nextGeometryKey = 1;
function geometryKey(type: string, value: object): string {
  const record = value as Record<string, unknown>;
  const coordinates = [record._docId, record._pathId, record._subPathIndex, record._index];
  if (coordinates.some((entry) => entry !== undefined)) return `${type}:${coordinates.join(":")}`;
  let key = geometryKeys.get(value); if (!key) { key = `${type}:object:${nextGeometryKey++}`; geometryKeys.set(value, key); } return key;
}
function serializeSubPathItem(value: PhotoshopSubPathItemLike): RemoteReference { return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.SubPathItem, geometryKey("SubPathItem", value), () => value); }
function serializePathPoint(value: PhotoshopPathPointLike): RemoteReference { return photoshopRegistry.getOrCreate(PHOTOSHOP_REMOTE_TYPE.PathPoint, geometryKey("PathPoint", value), () => value); }

/**
 * Serialize a native DOM result per its shared {@link PhotoshopResultKind} classification (ADR 0009).
 * The kind table (in the shared protocol) is the single source of truth; the host never
 * hand-maintains reference/collection/value property sets. `ownerReference` is threaded so a
 * collection snapshot can carry its owner.
 */
function serializeResult(resultKind: PhotoshopResultKind, ownerReference: RemoteReference, value: unknown): unknown {
  switch (resultKind.kind) {
    case "scalar":
      return value;
    case "value":
      return value == null ? null : serializeValue(resultKind.valueKind, value);
    case "ref":
      return value == null ? null : serializeReference(resultKind.refType, value);
    case "refUnion": {
      if (value == null) return undefined;
      const record = value as Record<string, unknown>;
      const typename = record.typename;
      const inferredType = typeof typename === "string" && resultKind.refTypes.includes(typename)
        ? typename
        : resultKind.refTypes.includes(PHOTOSHOP_REMOTE_TYPE.Document) && typeof record.id === "number"
          ? PHOTOSHOP_REMOTE_TYPE.Document
          : resultKind.refTypes.includes(PHOTOSHOP_REMOTE_TYPE.Channel) && typeof record.name === "string"
            ? PHOTOSHOP_REMOTE_TYPE.Channel
            : undefined;
      if (!inferredType) {
        throw new Error(`Expected a ${resultKind.refTypes.join(" or ")} result.`);
      }
      return serializeReference(inferredType, value);
    }
    case "collection":
      return value == null ? null : serializeSnapshot(resultKind.memberKind, ownerReference, value);
    default:
      throw new Error("Unknown photoshop result kind.");
  }
}

/** Serialize a single reference by its remote type name. */
function serializeReference(refType: string, value: unknown): RemoteReference {
  if (refType === PHOTOSHOP_REMOTE_TYPE.Photoshop) return serializePhotoshop(value as PhotoshopApp);
  if (refType === PHOTOSHOP_REMOTE_TYPE.Document) {
    return serializeDocument(value as PhotoshopDocumentLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Layer) {
    return serializeLayer(value as PhotoshopLayerLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Channel) {
    return serializeChannel(value as PhotoshopChannelLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.ColorSampler) return serializeColorSampler(value as PhotoshopColorSamplerLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.CountItem) return serializeCountItem(value as PhotoshopCountItemLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.LayerComp) return serializeLayerComp(value as PhotoshopLayerCompLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.Selection) {
    return serializeSelection(value as PhotoshopSelectionLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.HistoryState) {
    return serializeHistoryState(value as PhotoshopHistoryStateLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Guide) return serializeGuide(value as PhotoshopGuideLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.PathItem) {
    return serializePathItem(value as PhotoshopPathItemLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.SubPathItem) return serializeSubPathItem(value as PhotoshopSubPathItemLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.PathPoint) return serializePathPoint(value as PhotoshopPathPointLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.TextFont) return serializeTextFont(value as PhotoshopTextFontLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.TextItem) return serializeTextItem(value as PhotoshopTextItemLike);
  if (
    refType === PHOTOSHOP_REMOTE_TYPE.CharacterStyle ||
    refType === PHOTOSHOP_REMOTE_TYPE.ParagraphStyle ||
    refType === PHOTOSHOP_REMOTE_TYPE.TextWarpStyle
  ) {
    return serializeTextStyle(refType, value as PhotoshopCharacterStyleLike | PhotoshopParagraphStyleLike | PhotoshopTextWarpStyleLike);
  }
  if (refType === PHOTOSHOP_REMOTE_TYPE.Tool) return serializeTool(value as PhotoshopToolLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.ActionSet) return serializeActionSet(value as PhotoshopActionSetLike);
  if (refType === PHOTOSHOP_REMOTE_TYPE.Action) return serializeAction(value as PhotoshopActionLike);
  if (isPhotoshopPreferenceType(refType)) return serializePreference(refType, value as PhotoshopPreferencesLike);
  throw new Error(`Unknown photoshop reference type: ${refType}`);
}

function serializeSnapshot(memberKind: string, ownerReference: RemoteReference, collection: unknown): PhotoshopSnapshotTransport {
  let members: readonly unknown[];
  try {
    members = getMemberArray(collection);
  } catch (error) {
    const shape = collection == null ? String(collection) : `${typeof collection}:${Object.keys(collection as object).join(",")}`;
    throw new Error(`Expected a ${memberKind} member collection for ${ownerReference.type}; received ${shape}: ${String(error)}`);
  }
  if (memberKind === PHOTOSHOP_REMOTE_TYPE.PathItem && ownerReference.type === PHOTOSHOP_REMOTE_TYPE.Document) {
    const document = getDocument(ownerReference);
    for (const member of members) pathItemOwners.set(member as object, document);
  }
  if (ownerReference.type === PHOTOSHOP_REMOTE_TYPE.Document) {
    const document = getDocument(ownerReference);
    if (memberKind === PHOTOSHOP_REMOTE_TYPE.ColorSampler) for (const member of members) colorSamplerOwners.set(member as object, document);
    if (memberKind === PHOTOSHOP_REMOTE_TYPE.CountItem) for (const member of members) countItemOwners.set(member as object, document);
    if (memberKind === PHOTOSHOP_REMOTE_TYPE.LayerComp) for (const member of members) layerCompOwners.set(member as object, document);
  }
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

function getPhotoshopApp(reference: RemoteReference): PhotoshopApp {
  if (reference.type !== PHOTOSHOP_REMOTE_TYPE.Photoshop || reference.id !== PHOTOSHOP_APP_REFERENCE_ID) {
    throw new Error("Invalid Photoshop application reference.");
  }
  return getPhotoshop().app;
}

function getLayer(reference: RemoteReference): PhotoshopLayerLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Layer) as PhotoshopLayerLike;
}

function getChannel(reference: RemoteReference): PhotoshopChannelLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Channel) as PhotoshopChannelLike;
}

function getColorSampler(reference: RemoteReference): PhotoshopColorSamplerLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.ColorSampler) as PhotoshopColorSamplerLike;
}

function getCountItem(reference: RemoteReference): PhotoshopCountItemLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.CountItem) as PhotoshopCountItemLike;
}

function getLayerComp(reference: RemoteReference): PhotoshopLayerCompLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.LayerComp) as PhotoshopLayerCompLike;
}

function getSelection(reference: RemoteReference): PhotoshopSelectionLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Selection) as PhotoshopSelectionLike;
}

function getHistoryState(reference: RemoteReference): PhotoshopHistoryStateLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.HistoryState) as PhotoshopHistoryStateLike;
}

function getGuide(reference: RemoteReference): PhotoshopGuideLike { return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.Guide) as PhotoshopGuideLike; }
function getPathItem(reference: RemoteReference): PhotoshopPathItemLike { return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.PathItem) as PhotoshopPathItemLike; }
function getTextItem(reference: RemoteReference): PhotoshopTextItemLike {
  return photoshopRegistry.resolve(reference, PHOTOSHOP_REMOTE_TYPE.TextItem) as PhotoshopTextItemLike;
}
function getTextStyle(
  type: typeof PHOTOSHOP_REMOTE_TYPE.CharacterStyle | typeof PHOTOSHOP_REMOTE_TYPE.ParagraphStyle | typeof PHOTOSHOP_REMOTE_TYPE.TextWarpStyle,
  reference: RemoteReference
): Record<string, unknown> {
  return photoshopRegistry.resolve(reference, type) as Record<string, unknown>;
}

function decodeArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => decodeValue(arg));
}

function decodeReferenceOfType(value: unknown, type: string, label: string): unknown {
  if (!isRemoteReference(value) || value.type !== type) {
    throw new Error(`${label} must be a ${type} remote reference.`);
  }
  return photoshopRegistry.resolve(value, type);
}

function decodeReferenceArrayOfType(value: unknown, type: string, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of ${type} remote references.`);
  }
  return value.map((entry, index) => decodeReferenceOfType(entry, type, `${label}[${index}]`));
}

function decodeValue(value: unknown): unknown {
  if (isPhotoshopValueTransport(value)) {
    return value.data;
  }
  if (isUxpStorageEntryReference(value)) {
    return resolveUxpStorageEntryReference(value);
  }
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

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertNumberInRange(value: unknown, minimum: number, maximum: number, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function assertPoint(value: unknown, label: string): void {
  const point = assertObjectRecord(value, label);
  assertFiniteNumber(point.x, `${label}.x`);
  assertFiniteNumber(point.y, `${label}.y`);
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
