import assert from "node:assert/strict";
import { test } from "node:test";

const namespaceModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
const storageHostModule = "../../dist/uxp/uxp-api/modules/uxp/persistent-file-storage/host.js";
const solidColorModule = "../../dist/webview/photoshop-api/modules/photoshop/solid-color.js";
const colorModelsModule = "../../dist/webview/photoshop-api/modules/photoshop/color-models.js";

const appRef = { kind: "uxp.remote.ref", type: "Photoshop", id: "photoshop.app" };
const ref = (type, id) => ({ kind: "uxp.remote.ref", type, id });
const snapshot = (memberKind, owner, memberIds) => ({ kind: "uxp.photoshop.snapshot", memberKind, owner, memberIds });

test("PhotoshopApp exposes all 18 documented members and queues writes before methods", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  const calls = [];
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const rpc = {
    async call(module, method, args = []) {
      calls.push([module, method, args]);
      if (method === "app.propertySet") await writeGate;
      if (method === "app.propertyGet") {
        if (args[1] === "typename") return "Photoshop";
        if (args[1] === "documents") return snapshot("Document", appRef, ["doc-1"]);
      }
      if (method === "app.getColorProfiles") return ["sRGB IEC61966-2.1"];
      if (method === "app.open") return ref("Document", "doc-open");
      return undefined;
    }
  };
  const { app } = createPhotoshopNamespace(rpc);
  const members = ["typename", "preferences", "displayDialogs", "activeDocument", "getColorProfiles", "currentTool", "actionTree", "documents", "foregroundColor", "convertUnits", "backgroundColor", "fonts", "showAlert", "batchPlay", "bringToFront", "open", "createDocument", "updateUI"];
  for (const member of members) assert.ok(member in app, `app.${member} must exist.`);
  assert.equal(await app.typename, "Photoshop");

  app.displayDialogs = "silent";
  const profilesPromise = app.getColorProfiles("RGB");
  await Promise.resolve();
  assert.equal(calls.some(([, method]) => method === "app.getColorProfiles"), false, "later methods must await the write queue.");
  releaseWrite();
  assert.deepEqual(await profilesPromise, ["sRGB IEC61966-2.1"]);
  const fileRef = { kind: "uxp.storage.entry", type: "file", id: "file-1", entry: { isEntry: true, isFile: true, isFolder: false, name: "open.psd" } };
  await app.open({ toUxpStorageReference: async () => fileRef });
  assert.deepEqual(calls.find(([, method]) => method === "app.open")[2], [appRef, fileRef]);
  assert.deepEqual(calls.filter(([, method]) => method.startsWith("app.")).map(([, method]) => method), ["app.propertyGet", "app.propertySet", "app.getColorProfiles", "app.open"]);
});

test("Documents snapshot exposes collection metadata and stable remote members", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  const rpc = {
    async call(_module, method, args = []) {
      if (method === "app.propertyGet" && args[1] === "documents") return snapshot("Document", appRef, ["doc-1"]);
      if (method === "documents.getByName") return ref("Document", "doc-1");
      if (method === "documents.add") return ref("Document", "doc-2");
      return undefined;
    }
  };
  const { app } = createPhotoshopNamespace(rpc);
  const documents = await app.documents;
  assert.equal(documents.typename, "Documents");
  assert.equal(documents.parent, app);
  assert.equal(await documents.getByName("One"), documents[0]);
  assert.notEqual(await documents.add({ name: "Two" }), null);
});

test("SolidColor is constructible, transport-safe, and completes nearestWebColor/isEqual", async () => {
  const { SolidColor, encodePhotoshopArgument } = await import(solidColorModule);
  const { RGBColor } = await import(colorModelsModule);
  const white = new SolidColor();
  assert.equal(white.typename, "SolidColor");
  assert.ok(white.rgb instanceof RGBColor);
  assert.deepEqual([white.rgb.red, white.rgb.green, white.rgb.blue, white.rgb.hexValue], [255, 255, 255, "FFFFFF"]);
  const cmyk = new SolidColor("CMYKColorEnum");
  cmyk.cmyk.black = 25;
  assert.deepEqual(Object.keys(encodePhotoshopArgument(cmyk).data), ["cmyk"], "the most recently accessed model must cross the bridge.");
  const color = new SolidColor({ rgb: { red: 250, green: 2, blue: 49 } });
  assert.ok(color.nearestWebColor instanceof RGBColor);
  assert.deepEqual(
    [color.nearestWebColor.red, color.nearestWebColor.green, color.nearestWebColor.blue, color.nearestWebColor.hexValue],
    [255, 0, 51, "FF0033"]
  );
  assert.equal(color.isEqual(new SolidColor({ rgb: { red: 250.2, green: 2.1, blue: 49.1 } })), true);
  const envelope = encodePhotoshopArgument(color);
  assert.equal(envelope.kind, "uxp.photoshop.value");
  assert.equal(envelope.valueKind, "SolidColor");
  assert.deepEqual(Object.keys(envelope.data), ["rgb"], "only the active color model should be assigned host-side.");
});

test("host dispatches app, Documents, TextFonts, action tree, and Preferences through references", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const { destroyUxpPersistentFileStorageHandles, dispatchUxpPersistentFileStorageCall } = await import(storageHostModule);
  const originalRequire = globalThis.require;
  const modal = [];
  const document = { id: 7, name: "Existing" };
  const nativeFile = { isFile: true, isFolder: false, name: "open.psd", url: "plugin-temp:/open.psd" };
  const temporaryFolder = {
    isFile: false,
    isFolder: true,
    name: "temp",
    url: "plugin-temp:/",
    createFile: () => nativeFile
  };
  const font = { typename: "TextFont", family: "Inter", name: "Inter Regular", postScriptName: "Inter-Regular", style: "Regular" };
  const action = { typename: "Action", id: 2, index: 1, name: "Step", play() {} };
  const actionSet = { typename: "ActionSet", id: 1, index: 1, name: "Set", actions: [action], play() {} };
  action.parent = actionSet;
  const preferences = { typename: "Preferences", general: { typename: "PreferencesGeneral", exportClipboard: false, imageInterpolation: "bicubic", colorPicker: { type: "photoshopPicker" }, autoUpdateOpenDocuments: false, beepWhenDone: false } };
  class NativeColor { constructor() { this.rgb = {}; this.hsb = {}; this.cmyk = {}; this.lab = {}; this.gray = {}; } }
  const app = {
    typename: "Photoshop", displayDialogs: "silent", activeDocument: document, documents: [document], fonts: [font], actionTree: [actionSet], preferences,
    currentTool: { typename: "Tool", id: "moveTool" }, foregroundColor: new NativeColor(), backgroundColor: new NativeColor(), SolidColor: NativeColor,
    getColorProfiles: () => ["sRGB"], convertUnits: (value) => value, showAlert: async () => {}, batchPlay: async () => [], bringToFront() {}, updateUI: async () => {},
    createDocument(options) { const created = { id: 8, name: options?.name ?? "Untitled" }; this.documents.push(created); return created; },
    open(entry) { assert.equal(entry, nativeFile); return document; }
  };
  globalThis.require = (moduleName) => moduleName === "uxp"
    ? { storage: { localFileSystem: { getTemporaryFolder: async () => temporaryFolder } } }
    : { app, action: {}, core: { async executeAsModal(fn, options) { modal.push(options.commandName); return fn({}); } } };
  try {
    assert.equal(dispatchPhotoshopCall("app.propertyGet", [appRef, "typename"]), "Photoshop");
    const docs = dispatchPhotoshopCall("app.propertyGet", [appRef, "documents"]);
    assert.equal(docs.memberKind, "Document");
    assert.equal(dispatchPhotoshopCall("documents.getByName", [appRef, "Existing"]).type, "Document");
    const created = await dispatchPhotoshopCall("app.createDocument", [appRef, { name: "Created" }]);
    assert.equal(created.type, "Document");
    const folderRef = await dispatchUxpPersistentFileStorageCall("storage.localFileSystem.getTemporaryFolder", []);
    const fileRef = await dispatchUxpPersistentFileStorageCall("storage.folder.createFile", [folderRef, "open.psd"]);
    assert.equal((await dispatchPhotoshopCall("app.open", [appRef, fileRef])).type, "Document");
    const fonts = dispatchPhotoshopCall("app.propertyGet", [appRef, "fonts"]);
    const fontRef = dispatchPhotoshopCall("textFonts.getByName", [appRef, "Inter-Regular"]);
    assert.equal(fontRef.id, fonts.memberIds[0]);
    const tree = dispatchPhotoshopCall("app.propertyGet", [appRef, "actionTree"]);
    const setRef = ref("ActionSet", tree.memberIds[0]);
    const actions = dispatchPhotoshopCall("actionSet.propertyGet", [setRef, "actions"]);
    assert.equal(actions.memberKind, "Action");
    const prefsRef = dispatchPhotoshopCall("app.propertyGet", [appRef, "preferences"]);
    const generalRef = dispatchPhotoshopCall("preferences.propertyGet", [prefsRef, "general"]);
    await dispatchPhotoshopCall("preferences.propertySet", [generalRef, "exportClipboard", true]);
    assert.equal(preferences.general.exportClipboard, true);
    assert.deepEqual(modal, ["app.createDocument", "app.open", "preferences.propertySet"]);
  } finally {
    destroyPhotoshopHandles();
    destroyUxpPersistentFileStorageHandles();
    if (originalRequire === undefined) delete globalThis.require; else globalThis.require = originalRequire;
  }
});

test("host rejects malformed app calls before requiring Photoshop", async () => {
  const { dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  let requireCalls = 0;
  globalThis.require = () => { requireCalls += 1; throw new Error("host must not be touched"); };
  try {
    assert.throws(() => dispatchPhotoshopCall("app.showAlert", [appRef, 42]), /message/);
    assert.throws(() => dispatchPhotoshopCall("app.propertyGet", [appRef, "notAProperty"]), /Unknown Photoshop property/);
    assert.equal(requireCalls, 0);
  } finally {
    if (originalRequire === undefined) delete globalThis.require; else globalThis.require = originalRequire;
  }
});
