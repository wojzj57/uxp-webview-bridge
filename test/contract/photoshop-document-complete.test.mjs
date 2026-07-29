import assert from "node:assert/strict";
import { test } from "node:test";

const namespaceModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
const storageHostModule = "../../dist/uxp/uxp-api/modules/uxp/persistent-file-storage/host.js";
const ref = (type, id) => ({ kind: "uxp.remote.ref", type, id });
const snapshot = (memberKind, owner, memberIds) => ({ kind: "uxp.photoshop.snapshot", memberKind, owner, memberIds });
const value = (valueKind, data) => ({ kind: "uxp.photoshop.value", valueKind, data });

const DOCUMENT_PROPERTIES = [
  "saveAs", "selection", "activeChannels", "activeHistoryBrushSource", "activeHistoryState", "activeLayers",
  "artboards", "backgroundLayer", "bitsPerChannel", "channels", "cloudDocument", "cloudWorkAreaDirectory",
  "colorProfileName", "colorProfileType", "colorSamplers", "componentChannels", "compositeChannels", "countItems",
  "guides", "height", "histogram", "historyStates", "id", "layerComps", "layers", "mode", "name", "path",
  "pathItems", "pixelAspectRatio", "quickMaskMode", "resolution", "saved", "title", "typename", "width", "zoom"
];
const DOCUMENT_METHODS = [
  "calculations", "changeMode", "close", "closeWithoutSaving", "convertProfile", "createLayer", "createLayerGroup",
  "createPixelLayer", "createTextLayer", "crop", "duplicate", "duplicateLayers", "flatten", "generativeUpscale",
  "groupLayers", "linkLayers", "mergeVisibleLayers", "paste", "rasterizeAllLayers", "resizeCanvas", "resizeImage",
  "revealAll", "rotate", "sampleColor", "save", "splitChannels", "suspendHistory", "trap", "trim"
];

test("PsDocument exposes exactly the 66 transportable documented members and saveAs honors queued writes", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  const docRef = ref("Document", "doc-1");
  const calls = [];
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const rpc = {
    async call(_module, method, args = []) {
      calls.push([method, args]);
      if (method === "app.propertyGet" && args[1] === "activeDocument") return docRef;
      if (method === "document.propertySet") await writeGate;
      if (method === "document.propertyGet") {
        if (args[1] === "colorSamplers") return snapshot("ColorSampler", docRef, ["sampler-1"]);
        if (args[1] === "countItems") return snapshot("CountItem", docRef, ["count-1"]);
        if (args[1] === "layerComps") return snapshot("LayerComp", docRef, ["comp-1"]);
      }
      if (method === "colorSamplers.add") return ref("ColorSampler", "sampler-2");
      if (method === "countItems.getAll") return snapshot("CountItem", docRef, ["count-1"]);
      if (method === "layerComps.getAllByName") return snapshot("LayerComp", docRef, ["comp-1"]);
      if (method === "document.sampleColor") return value("SampledColor", { typename: "NoColor" });
      if (method === "document.calculations") return ref("Channel", "channel-1");
      if (method === "channel.propertyGet" && args[1] === "name") return "Alpha";
      if (method === "document.splitChannels") return snapshot("Document", docRef, ["doc-2"]);
      return undefined;
    }
  };
  const { app } = createPhotoshopNamespace(rpc);
  const document = await app.activeDocument;
  assert.equal(DOCUMENT_PROPERTIES.length + DOCUMENT_METHODS.length, 66);
  for (const name of [...DOCUMENT_PROPERTIES, ...DOCUMENT_METHODS]) assert.ok(name in document, `document.${name} must exist.`);

  document.quickMaskMode = true;
  const fileRef = { kind: "uxp.storage.entry", type: "file", id: "file-1" };
  const save = document.saveAs.psd({ toUxpStorageReference: async () => fileRef }, { layers: true });
  await Promise.resolve();
  assert.equal(calls.some(([method]) => method === "document.saveAs.psd"), false, "saveAs must wait for queued writes.");
  releaseWrite();
  await save;
  assert.deepEqual(calls.find(([method]) => method === "document.saveAs.psd")[1], [docRef, fileRef, { layers: true }]);

  const samplers = await document.colorSamplers;
  assert.equal(samplers.parent, document);
  assert.equal((await samplers.add({ x: 3, y: 4 })).constructor, samplers[0].constructor);
  const counts = await document.countItems;
  assert.equal(counts.typename, "CountItems");
  assert.equal((await counts.getAll())[0], counts[0]);
  const comps = await document.layerComps;
  assert.equal(comps.typename, "LayerComps");
  assert.equal((await comps.getAllByName("A"))[0], comps[0]);
  assert.deepEqual(await document.sampleColor({ x: 0, y: 0 }), { typename: "NoColor" });
  assert.equal(
    await document.calculations({}).name,
    "Alpha",
    "calculations should expose decoded reference unions as chainable remote results."
  );
  assert.equal((await document.splitChannels()).length, 1);
});

test("Photoshop host bridges Document completion and all sampler/count/comp operations with correct modal policy", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const { destroyUxpPersistentFileStorageHandles, dispatchUxpPersistentFileStorageCall } = await import(storageHostModule);
  const originalRequire = globalThis.require;
  const calls = [];
  const modal = [];
  class NativeColor {
    constructor() {
      this.typename = "SolidColor";
      this.rgb = { red: 1, green: 2, blue: 3, hexValue: "010203" };
      this.hsb = { hue: 1, saturation: 2, brightness: 3 };
      this.cmyk = { cyan: 1, magenta: 2, yellow: 3, black: 4 };
      this.lab = { l: 1, a: 2, b: 3 };
      this.gray = { gray: 4 };
    }
  }
  const nativeFile = { isFile: true, isFolder: false, name: "out.psd" };
  const temp = { isFile: false, isFolder: true, name: "temp", createFile: () => nativeFile };
  const sampler = { typename: "ColorSampler", position: { x: 1, y: 2 }, color: new NativeColor(), move(p) { this.position = p; calls.push("sampler.move"); }, remove() { calls.push("sampler.remove"); } };
  const count = { typename: "CountItem", itemIndex: 1, groupIndex: 2, position: { x: 2, y: 3 }, move(p) { this.position = p; }, remove() {} };
  const comp = { typename: "LayerComp", id: 5, docId: 7, name: "A", comment: null, selected: true, appearance: true, position: true, visibility: true, childComp: false, apply() {}, duplicate() { return { ...this, id: 6, name: "A copy" }; }, recapture() {}, remove() {}, resetLayerComp() {} };
  // Native Photoshop Channel objects do not consistently expose `typename`; calculations still
  // needs to discriminate the documented Document | Channel result union.
  const channel = { name: "Alpha" };
  const split = { typename: "Document", id: 8 };
  const document = {
    typename: "Document", id: 7, saved: true, name: "Fixture", title: "Fixture", path: "", width: 10, height: 10,
    resolution: 72, cloudDocument: false, cloudWorkAreaDirectory: "", pixelAspectRatio: 1, histogram: [1], mode: "RGBColorMode",
    zoom: 100, quickMaskMode: false, bitsPerChannel: "eight", colorProfileName: "sRGB", colorProfileType: "working",
    layers: [], activeLayers: [], artboards: [], backgroundLayer: null, channels: [channel], componentChannels: [channel],
    compositeChannels: [channel], activeChannels: [channel], guides: [], pathItems: [], historyStates: [], colorSamplers: [sampler],
    countItems: [count], layerComps: [comp], selection: { typename: "Selection", docId: 7 },
    sampleColor: () => new NativeColor(), calculations: () => channel, splitChannels: () => [split],
    changeMode(...args) { calls.push(["changeMode", args]); }, convertProfile() {}, generativeUpscale() {}, trap() {},
    saveAs: { psd(entry, options) { calls.push(["saveAs.psd", entry, options]); } }
  };
  sampler.parent = document;
  count.parent = document.countItems;
  comp.parent = document;
  document.colorSamplers.add = (position) => ({ ...sampler, position }); document.colorSamplers.removeAll = () => {};
  for (const name of ["add", "removeAllFromActiveGroup", "getAll", "createGroup", "renameActiveGroup", "removeGroupByIndex", "toggleActiveGroupVisibility", "activateGroupByIndex", "setActiveMarkerSize", "setActiveLabelSize", "setActiveColor"]) {
    document.countItems[name] = name === "add" ? () => count : name === "getAll" ? () => [count] : () => {};
  }
  document.layerComps.add = () => comp; document.layerComps.getAllByName = () => [comp]; document.layerComps.removeAll = () => {};
  document.channels.removeAll = () => {};
  globalThis.require = (moduleName) => moduleName === "uxp"
    ? { storage: { localFileSystem: { getTemporaryFolder: async () => temp } } }
    : { app: { activeDocument: document, documents: [document], SolidColor: NativeColor }, action: {}, core: { async executeAsModal(fn, options) { modal.push(options.commandName); return fn({}); } } };
  try {
    const docRef = dispatchPhotoshopCall("app.activeDocument", []);
    for (const name of ["typename", "histogram", "mode", "zoom", "quickMaskMode", "bitsPerChannel", "colorProfileName", "colorProfileType"]) {
      assert.notEqual(dispatchPhotoshopCall("document.propertyGet", [docRef, name]), undefined, name);
    }
    await dispatchPhotoshopCall("document.propertySet", [docRef, "quickMaskMode", true]);
    assert.equal(document.quickMaskMode, true);
    assert.throws(
      () => dispatchPhotoshopCall("document.propertySet", [docRef, "activeLayers", [docRef]]),
      /must be a Layer remote reference/
    );
    assert.equal(dispatchPhotoshopCall("document.propertyGet", [docRef, "colorSamplers"]).memberKind, "ColorSampler");
    assert.equal(dispatchPhotoshopCall("document.propertyGet", [docRef, "countItems"]).memberKind, "CountItem");
    assert.equal(dispatchPhotoshopCall("document.propertyGet", [docRef, "layerComps"]).memberKind, "LayerComp");
    assert.equal((await dispatchPhotoshopCall("document.sampleColor", [docRef, { x: 1, y: 1 }])).valueKind, "SampledColor");
    assert.equal((await dispatchPhotoshopCall("document.calculations", [docRef, {}])).type, "Channel");
    assert.equal((await dispatchPhotoshopCall("document.splitChannels", [docRef])).memberKind, "Document");
    await dispatchPhotoshopCall("document.changeMode", [docRef, "grayscaleMode"]);

    const folderRef = await dispatchUxpPersistentFileStorageCall("storage.localFileSystem.getTemporaryFolder", []);
    const fileRef = await dispatchUxpPersistentFileStorageCall("storage.folder.createFile", [folderRef, "out.psd"]);
    await dispatchPhotoshopCall("document.saveAs.psd", [docRef, fileRef, { layers: true }]);
    assert.deepEqual(calls.find((entry) => Array.isArray(entry) && entry[0] === "saveAs.psd"), ["saveAs.psd", nativeFile, { layers: true }]);

    const samplerSnapshot = dispatchPhotoshopCall("document.propertyGet", [docRef, "colorSamplers"]);
    const samplerRef = ref("ColorSampler", samplerSnapshot.memberIds[0]);
    assert.equal(dispatchPhotoshopCall("colorSampler.propertyGet", [samplerRef, "parent"]).id, docRef.id);
    assert.equal(dispatchPhotoshopCall("colorSampler.propertyGet", [samplerRef, "position"]).valueKind, "Point");
    assert.equal(dispatchPhotoshopCall("colorSampler.propertyGet", [samplerRef, "color"]).valueKind, "SampledColor");
    await dispatchPhotoshopCall("colorSampler.move", [samplerRef, { x: 9, y: 9 }]);
    await dispatchPhotoshopCall("colorSampler.remove", [samplerRef]);
    assert.equal((await dispatchPhotoshopCall("colorSamplers.add", [docRef, { x: 4, y: 5 }])).type, "ColorSampler");
    await dispatchPhotoshopCall("colorSamplers.removeAll", [docRef]);

    const countSnapshot = dispatchPhotoshopCall("document.propertyGet", [docRef, "countItems"]);
    const countRef = ref("CountItem", countSnapshot.memberIds[0]);
    assert.equal(dispatchPhotoshopCall("countItem.propertyGet", [countRef, "parent"]).memberKind, "CountItem");
    assert.equal(dispatchPhotoshopCall("countItem.propertyGet", [countRef, "position"]).valueKind, "Point");
    await dispatchPhotoshopCall("countItem.move", [countRef, { x: 6, y: 7 }]);
    await dispatchPhotoshopCall("countItem.remove", [countRef]);
    assert.equal((await dispatchPhotoshopCall("countItems.add", [docRef, { x: 1, y: 2 }])).type, "CountItem");
    assert.equal(dispatchPhotoshopCall("countItems.getAll", [docRef]).memberIds[0], countRef.id);
    for (const [name, argument] of [
      ["createGroup", "G"], ["renameActiveGroup", "Renamed"], ["removeGroupByIndex", 0],
      ["toggleActiveGroupVisibility", true], ["activateGroupByIndex", 0], ["setActiveMarkerSize", 2],
      ["setActiveLabelSize", 8], ["setActiveColor", { rgb: { red: 1, green: 2, blue: 3 } }]
    ]) {
      await dispatchPhotoshopCall(`countItems.${name}`, [docRef, argument]);
    }
    await dispatchPhotoshopCall("countItems.removeAllFromActiveGroup", [docRef]);

    const compSnapshot = dispatchPhotoshopCall("document.propertyGet", [docRef, "layerComps"]);
    const compRef = ref("LayerComp", compSnapshot.memberIds[0]);
    assert.equal(dispatchPhotoshopCall("layerComp.propertyGet", [compRef, "comment"]), null, "nullable scalars must remain null.");
    await dispatchPhotoshopCall("layerComp.propertySet", [compRef, "name", "B"]);
    assert.equal(comp.name, "B");
    await dispatchPhotoshopCall("layerComp.batchSet", [compRef, { comment: "updated", visibility: false }]);
    assert.deepEqual(dispatchPhotoshopCall("layerComp.batchGet", [compRef, ["comment", "visibility"]]), {
      comment: "updated", visibility: false
    });
    await dispatchPhotoshopCall("layerComp.apply", [compRef]);
    assert.equal((await dispatchPhotoshopCall("layerComp.duplicate", [compRef])).type, "LayerComp");
    await dispatchPhotoshopCall("layerComp.recapture", [compRef, { visibility: true }]);
    await dispatchPhotoshopCall("layerComp.resetLayerComp", [compRef]);
    await dispatchPhotoshopCall("layerComp.remove", [compRef]);
    assert.equal((await dispatchPhotoshopCall("layerComps.add", [docRef, { name: "New" }])).type, "LayerComp");
    assert.equal(dispatchPhotoshopCall("layerComps.getAllByName", [docRef, "A"]).memberKind, "LayerComp");
    await dispatchPhotoshopCall("layerComps.removeAll", [docRef]);

    assert.ok(modal.includes("document.set.quickMaskMode"));
    assert.ok(modal.includes("document.saveAs.psd"));
    assert.ok(modal.includes("countItems.setActiveColor"));
    assert.ok(modal.includes("layerComp.recapture"));
    assert.ok(modal.includes("sampleColor"), "Photoshop requires sampleColor's internal event to run modally.");
  } finally {
    destroyPhotoshopHandles(); destroyUxpPersistentFileStorageHandles();
    if (originalRequire === undefined) delete globalThis.require; else globalThis.require = originalRequire;
  }
});
