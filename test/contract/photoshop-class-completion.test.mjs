import assert from "node:assert/strict";
import { test } from "node:test";

const layerModule = "../../dist/webview/photoshop-api/modules/photoshop/layer.js";
const textModule = "../../dist/webview/photoshop-api/modules/photoshop/text.js";
const namespaceModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";
const publicModule = "../../dist/webview/index.js";
const solidColorModule = "../../dist/webview/photoshop-api/modules/photoshop/solid-color.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
const storageHostModule = "../../dist/uxp/uxp-api/modules/uxp/persistent-file-storage/host.js";

const ref = (type, id) => ({ kind: "uxp.remote.ref", type, id });
const snapshot = (memberKind, owner, memberIds) => ({ kind: "uxp.photoshop.snapshot", memberKind, owner, memberIds });

const LAYER_PROPERTIES = [
  "typename", "locked", "allLocked", "pixelsLocked", "positionLocked", "transparentPixelsLocked",
  "isBackgroundLayer", "visible", "kind", "bounds", "boundsNoEffects", "opacity", "fillOpacity",
  "filterMaskDensity", "filterMaskFeather", "layerMaskDensity", "layerMaskFeather", "vectorMaskDensity",
  "vectorMaskFeather", "isClippingMask", "blendMode", "linkedLayers", "name", "id", "document",
  "parent", "textItem", "layers"
];

const LAYER_METHODS = [
  "applyAddNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds", "applyCustomFilter",
  "applyDeInterlace", "applyDespeckle", "applyDifferenceClouds", "applyDiffuseGlow", "applyDisplace",
  "applyDustAndScratches", "applyGaussianBlur", "applyGlassEffect", "applyHighPass", "applyLensBlur",
  "applyLensFlare", "applyMaximum", "applyMinimum", "applyMedianNoise", "applyMotionBlur", "applyNTSC",
  "applyOceanRipple", "applyOffset", "applyTwirl", "applyPinch", "applyPolarCoordinates", "applyRipple",
  "applySharpen", "applySharpenEdges", "applySharpenMore", "applyShear", "applySmartBlur", "applySpherize",
  "applyUnSharpMask", "applyWave", "applyZigZag", "applyImage", "delete", "duplicate", "link", "unlink",
  "move", "bringToFront", "sendToBack", "translate", "flip", "scale", "rotate", "skew", "clear", "copy",
  "cut", "merge", "rasterize"
];

const CHARACTER_PROPERTIES = [
  "font", "size", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "useAutoLeading", "leading",
  "tracking", "baselineShift", "horizontalDiacriticPosition", "verticalDiacriticPosition", "autoKerning",
  "capitalization", "baseline", "strikeThrough", "underline", "ligatures", "alternateLigatures", "fractions",
  "ordinals", "swash", "titlingAlternates", "stylisticAlternates", "language", "characterAlignment", "noBreak",
  "color", "kashidas", "middleEasternTextDirection", "middleEasternDigitsType", "fractionalWidths", "antiAliasMethod"
];
const PARAGRAPH_PROPERTIES = [
  "justification", "justificationFeatures", "leftIndent", "rightIndent", "firstLineIndent", "spaceBefore",
  "kashidaWidth", "kinsoku", "mojikumi", "spaceAfter", "hyphenation", "hyphenationFeatures", "layoutMode", "features"
];
const WARP_PROPERTIES = ["style", "direction", "bend", "horizontalDistortion", "verticalDistortion"];
const TEXT_ITEM_PROPERTIES = [
  "parent", "typename", "contents", "textClickPoint", "orientation", "isPointText", "isParagraphText",
  "characterStyle", "paragraphStyle", "warpStyle"
];
const TEXT_ITEM_METHODS = ["convertToParagraphText", "convertToPointText", "convertToShape", "createWorkPath"];

test("class manifests close Layer, Text, Layers, and constructible value classes", async () => {
  const { createLayerMethods, createLayerProperties } = await import(layerModule);
  const {
    createCharacterStyleProperties,
    createParagraphStyleProperties,
    createTextItemMethods,
    createTextItemProperties,
    createTextWarpStyleProperties
  } = await import(textModule);
  const {
    CMYKColor, GrayColor, HSBColor, LabColor, PathPointInfo, RGBColor, SubPathInfo, photoshop
  } = await import(publicModule);
  const { encodePhotoshopArgument } = await import(solidColorModule);

  assert.deepEqual(Object.keys(createLayerProperties()).filter((name) => name !== "selected").sort(), [...LAYER_PROPERTIES].sort());
  assert.deepEqual(Object.keys(createLayerMethods()).sort(), [...LAYER_METHODS].sort());
  assert.equal(LAYER_PROPERTIES.length + LAYER_METHODS.length, 83);
  assert.deepEqual(Object.keys(createCharacterStyleProperties()).sort(), [...CHARACTER_PROPERTIES].sort());
  assert.deepEqual(Object.keys(createParagraphStyleProperties()).sort(), [...PARAGRAPH_PROPERTIES].sort());
  assert.deepEqual(Object.keys(createTextWarpStyleProperties()).sort(), [...WARP_PROPERTIES].sort());
  assert.deepEqual(Object.keys(createTextItemProperties()).sort(), [...TEXT_ITEM_PROPERTIES].sort());
  assert.deepEqual(Object.keys(createTextItemMethods()).sort(), [...TEXT_ITEM_METHODS].sort());

  const constructors = [
    [new CMYKColor(), "CMYKColor"], [new GrayColor(), "GrayColor"], [new HSBColor(), "HSBColor"],
    [new LabColor(), "LabColor"], [new RGBColor(), "RGBColor"]
  ];
  for (const [value, typename] of constructors) assert.equal(value.typename, typename);
  const rgb = new RGBColor({ hexValue: "#ff0080" });
  assert.deepEqual([rgb.red, rgb.green, rgb.blue, rgb.hexValue], [255, 0, 128, "FF0080"]);
  assert.throws(() => { rgb.red = 256; }, RangeError);

  const point = new PathPointInfo({ anchor: [1, 2], leftDirection: [1, 2], rightDirection: [1, 2] });
  const subPath = new SubPathInfo({ entireSubPath: [point] });
  assert.equal(point.typename, "PathPointInfo");
  assert.equal(subPath.typename, "SubPathInfo");
  assert.deepEqual(encodePhotoshopArgument(subPath), {
    closed: false,
    entireSubPath: [{ anchor: [1, 2], kind: "cornerPoint", leftDirection: [1, 2], rightDirection: [1, 2] }],
    operation: "add"
  });
  assert.equal(photoshop.CMYKColor, CMYKColor);
  assert.equal(photoshop.app.PathPointInfo, PathPointInfo);
  assert.equal(photoshop.app.SubPathInfo, SubPathInfo);
});

test("Text RemoteObjects preserve identity and queued writes before methods", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  const appRef = ref("Photoshop", "photoshop.app");
  const documentRef = ref("Document", "doc-1");
  const layerRef = ref("Layer", "layer-1");
  const textRef = ref("TextItem", "text-1");
  const characterRef = ref("CharacterStyle", "character-1");
  const calls = [];
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const rpc = {
    async call(_module, method, args = []) {
      calls.push([method, args]);
      if (method === "app.propertyGet") return documentRef;
      if (method === "document.propertyGet") return snapshot("Layer", documentRef, [layerRef.id]);
      if (method === "layer.propertyGet") return args[1] === "layers" ? null : textRef;
      if (method === "textItem.propertyGet") return characterRef;
      if (method === "characterStyle.propertySet") await writeGate;
      return undefined;
    }
  };
  const { app } = createPhotoshopNamespace(rpc);
  const document = await app.activeDocument;
  const layers = await document.layers;
  assert.equal(layers.typename, "Layers");
  const text = await layers[0].textItem;
  assert.equal(await layers[0].textItem, text);
  assert.equal(await layers[0].layers, null);
  const style = await text.characterStyle;
  assert.equal(await text.characterStyle, style);
  style.size = 24;
  const resetPromise = style.reset();
  await Promise.resolve();
  assert.equal(calls.some(([method]) => method === "characterStyle.reset"), false);
  releaseWrite();
  await resetPromise;
  assert.equal(calls.at(-1)[0], "characterStyle.reset");
  assert.deepEqual(calls.find(([method]) => method === "characterStyle.propertySet")[1], [characterRef, "size", 24]);
  assert.equal(appRef.type, "Photoshop");
});

test("host routes every Layer method and the complete Text object graph with modal writes", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const { destroyUxpPersistentFileStorageHandles, dispatchUxpPersistentFileStorageCall } = await import(storageHostModule);
  const originalRequire = globalThis.require;
  const modal = [];
  const nativeCalls = [];
  class NativeColor {
    constructor() { this.typename = "SolidColor"; this.rgb = {}; this.hsb = {}; this.cmyk = {}; this.lab = {}; this.gray = {}; }
  }
  const characterStyle = Object.fromEntries(CHARACTER_PROPERTIES.map((name) => [name, name === "color" ? new NativeColor() : 1]));
  characterStyle.reset = () => nativeCalls.push(["characterStyle.reset"]);
  const paragraphStyle = Object.fromEntries(PARAGRAPH_PROPERTIES.map((name) => [name, 1]));
  paragraphStyle.reset = () => nativeCalls.push(["paragraphStyle.reset"]);
  const warpStyle = Object.fromEntries(WARP_PROPERTIES.map((name) => [name, 1]));
  warpStyle.reset = () => nativeCalls.push(["warpStyle.reset"]);
  const layer = { id: 10, typename: "Layer", name: "Text", selected: true, layers: null };
  const group = { id: 11, typename: "Layer", name: "Group", selected: false, layers: [] };
  const textItem = {
    parent: layer, typename: "TextItem", contents: "Hello", textClickPoint: { x: 1, y: 2 }, orientation: "horizontal",
    isPointText: true, isParagraphText: false, characterStyle, paragraphStyle, warpStyle
  };
  layer.textItem = textItem;
  textItem.convertToParagraphText = () => textItem;
  textItem.convertToPointText = () => textItem;
  textItem.convertToShape = () => undefined;
  textItem.createWorkPath = () => undefined;
  for (const name of LAYER_METHODS) {
    layer[name] = (...args) => {
      nativeCalls.push([name, ...args]);
      if (name === "duplicate" || name === "merge") return layer;
      if (name === "link") return [layer];
      return undefined;
    };
  }
  group.layers.add = () => { const child = { ...layer, id: 12, name: "Child", layers: null }; group.layers.push(child); return child; };
  const document = { id: 7, typename: "Document", layers: [layer, group] };
  const nativeFile = { isFile: true, isFolder: false, name: "map.psd", url: "plugin-temp:/map.psd" };
  const folder = { isFile: false, isFolder: true, name: "temp", url: "plugin-temp:/", createFile: async () => nativeFile };
  const photoshopHost = {
    app: { activeDocument: document, documents: [document], SolidColor: NativeColor },
    core: { executeAsModal: async (fn, options) => { modal.push(options.commandName); return fn(); } },
    action: { batchPlay: async () => [], getIDFromString: () => 1, recordAction: () => undefined }
  };
  const uxpHost = { storage: { localFileSystem: { getTemporaryFolder: async () => folder } } };
  globalThis.require = (name) => name === "photoshop" ? photoshopHost : uxpHost;
  destroyPhotoshopHandles();
  destroyUxpPersistentFileStorageHandles();
  try {
    const documentRef = dispatchPhotoshopCall("app.activeDocument", []);
    const layerSnapshot = dispatchPhotoshopCall("document.propertyGet", [documentRef, "layers"]);
    const layerRef = ref("Layer", layerSnapshot.memberIds[0]);
    const groupRef = ref("Layer", layerSnapshot.memberIds[1]);
    assert.equal(dispatchPhotoshopCall("layer.propertyGet", [layerRef, "layers"]), null);
    assert.equal(dispatchPhotoshopCall("layer.propertyGet", [groupRef, "layers"]).memberKind, "Layer");

    const textRef = dispatchPhotoshopCall("layer.propertyGet", [layerRef, "textItem"]);
    assert.equal(dispatchPhotoshopCall("layer.propertyGet", [layerRef, "textItem"]).id, textRef.id);
    const beforeRead = modal.length;
    assert.equal(dispatchPhotoshopCall("textItem.propertyGet", [textRef, "contents"]), "Hello");
    assert.equal(modal.length, beforeRead, "Text reads must not enter modal execution.");
    const characterRef = dispatchPhotoshopCall("textItem.propertyGet", [textRef, "characterStyle"]);
    assert.equal(dispatchPhotoshopCall("textItem.propertyGet", [textRef, "characterStyle"]).id, characterRef.id);
    await dispatchPhotoshopCall("characterStyle.propertySet", [characterRef, "size", 18]);
    await dispatchPhotoshopCall("characterStyle.reset", [characterRef]);
    assert.equal(characterStyle.size, 18);
    const paragraphRef = dispatchPhotoshopCall("textItem.propertyGet", [textRef, "paragraphStyle"]);
    const warpRef = dispatchPhotoshopCall("textItem.propertyGet", [textRef, "warpStyle"]);
    assert.equal(dispatchPhotoshopCall("textItem.propertyGet", [textRef, "paragraphStyle"]).id, paragraphRef.id);
    assert.equal(dispatchPhotoshopCall("textItem.propertyGet", [textRef, "warpStyle"]).id, warpRef.id);
    await dispatchPhotoshopCall("paragraphStyle.propertySet", [paragraphRef, "leftIndent", 12]);
    await dispatchPhotoshopCall("textWarpStyle.propertySet", [warpRef, "bend", 10]);
    await dispatchPhotoshopCall("paragraphStyle.reset", [paragraphRef]);
    await dispatchPhotoshopCall("textWarpStyle.reset", [warpRef]);
    const converted = await dispatchPhotoshopCall("textItem.convertToParagraphText", [textRef]);
    assert.equal(converted.id, textRef.id);

    const folderRef = await dispatchUxpPersistentFileStorageCall("storage.localFileSystem.getTemporaryFolder", []);
    const fileRef = await dispatchUxpPersistentFileStorageCall("storage.folder.createFile", [folderRef, "map.psd"]);
    for (const name of LAYER_METHODS) {
      const args = name === "applyDisplace" ? [1, 1, "stretchToFit", "wrapAround", fileRef] : [];
      await dispatchPhotoshopCall(`layer.${name}`, [layerRef, ...args]);
    }
    assert.ok(nativeCalls.some(([name, , , , , file]) => name === "applyDisplace" && file === nativeFile));
    for (const name of LAYER_METHODS) assert.ok(modal.includes(name), `${name} must execute modally.`);
    assert.ok(modal.includes("characterStyle.set.size"));
    assert.ok(modal.includes("characterStyle.reset"));
    assert.ok(modal.includes("convertToParagraphText"));
    assert.throws(
      () => dispatchPhotoshopCall("layer.applyDisplace", [layerRef, 1, 1, "stretchToFit", "wrapAround", { bad: true }]),
      /UXP storage File reference/
    );
  } finally {
    destroyPhotoshopHandles();
    destroyUxpPersistentFileStorageHandles();
    globalThis.require = originalRequire;
  }
});
