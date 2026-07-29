import assert from "node:assert/strict";
import { test } from "node:test";

// Reach into the built module internals directly (contract tests run against dist). The factories are
// not part of the public `photoshop` namespace surface, so we import them from their own dist files.
const documentModule = "../../dist/webview/photoshop-api/modules/photoshop/document.js";
const layerModule = "../../dist/webview/photoshop-api/modules/photoshop/layer.js";
const channelModule = "../../dist/webview/photoshop-api/modules/photoshop/channel.js";
const colorSamplerModule = "../../dist/webview/photoshop-api/modules/photoshop/color-sampler.js";
const countItemModule = "../../dist/webview/photoshop-api/modules/photoshop/count-item.js";
const layerCompModule = "../../dist/webview/photoshop-api/modules/photoshop/layer-comp.js";
const selectionModule = "../../dist/webview/photoshop-api/modules/photoshop/selection.js";
const historyStateModule = "../../dist/webview/photoshop-api/modules/photoshop/history-state.js";
const guideModule = "../../dist/webview/photoshop-api/modules/photoshop/guide.js";
const pathItemModule = "../../dist/webview/photoshop-api/modules/photoshop/path-item.js";
const subPathItemModule = "../../dist/webview/photoshop-api/modules/photoshop/sub-path-item.js";
const pathPointModule = "../../dist/webview/photoshop-api/modules/photoshop/path-point.js";
const textModule = "../../dist/webview/photoshop-api/modules/photoshop/text.js";

/**
 * A recording rpc that resolves every call to a benign value and never throws. The only way a member
 * access can fail is the RemoteClass base's own "No RPC method name configured" guard — exactly the
 * descriptor <-> declare (and descriptor <-> methodNames) drift RFC-0007 mandates catching.
 */
function createRecordingRpc() {
  const calls = [];
  return {
    calls,
    call(module, method, args) {
      calls.push({ module, method, args });
      // batchGet decodes each requested property off the returned map, so hand back an object.
      return Promise.resolve(method.endsWith(".batchGet") ? {} : null);
    }
  };
}

const reference = (type) => ({ kind: "uxp.remote.ref", type, id: `${type}-1` });

const registryModule = "../../dist/webview/photoshop-api/modules/photoshop/registry.js";
const protocolModule = "../../dist/shared/photoshop-api/photoshop-protocol.js";

/**
 * Build a real PhotoshopContext (`{ rpc, registry }`) for the class factories (ADR 0009). The
 * registry needs Document and Layer registered so the decode context can resolve their reference /
 * collection typings; we register lightweight placeholder factories (a bare reference holder) rather
 * than the real classes, because these smoke reads never decode a concrete envelope — the recording
 * rpc returns benign `null`/`{}` so ref decodes yield `null` and value/collection decodes surface a
 * decode error, neither of which is the "No RPC method name configured" drift this test guards.
 */
async function createStubContext(rpc) {
  const { createPhotoshopTypeRegistry } = await import(registryModule);
  const { PHOTOSHOP_REMOTE_TYPE } = await import(protocolModule);
  const registry = createPhotoshopTypeRegistry(rpc);
  const placeholder = (ref) => ({ toRemoteReference: () => Promise.resolve(ref) });
  registry.register(PHOTOSHOP_REMOTE_TYPE.Document, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Channel, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.ColorSampler, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.CountItem, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.LayerComp, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Selection, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.HistoryState, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.PathItem, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Guide, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.SubPathItem, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.PathPoint, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.TextItem, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.CharacterStyle, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.ParagraphStyle, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.TextWarpStyle, placeholder);
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Layer, {
    methods: {
      getByName: { rpc: "layers.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.Layer } },
      add: { rpc: "layers.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.Layer } }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Channel, {
    methods: {
      getByName: { rpc: "channels.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.Channel } }
    }
  });
  return { rpc, registry };
}

function ownMemberNames(instance) {
  const names = new Set();
  for (let target = instance; target && target !== Object.prototype; target = Object.getPrototypeOf(target)) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name !== "constructor") {
        names.add(name);
      }
    }
  }
  return [...names];
}

function findDescriptor(instance, name) {
  for (let target = instance; target && target !== Object.prototype; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

/**
 * Exercise a member and return the error it rejected/threw with, or `undefined` if it resolved. The
 * caller asserts on the *kind* of failure: a decode-path error (benign here — the recording rpc
 * returns null, so value/collection decodes reject) is fine; the "No RPC method name configured"
 * base-class guard is the descriptor<->RPC-name drift this test must catch.
 */
async function exerciseMember(instance, name) {
  const descriptor = findDescriptor(instance, name);
  try {
    if (descriptor?.get) {
      await instance[name];
      return undefined;
    }
    const value = instance[name];
    if (typeof value === "function") {
      await value.call(instance);
    }
    return undefined;
  } catch (error) {
    return error;
  }
}

// Base members that RemoteClass provides and that are exercised by their own dedicated cases below.
const BASE_MEMBERS = new Set(["toRemoteReference", "batchGet", "batchSet", "dispose"]);

const CASES = [
  {
    name: "WebviewPsDocument",
    type: "Document",
    batchGetName: "document.batchGet",
    batchSetName: "document.batchSet",
    writableProp: "pixelAspectRatio",
    async build() {
      const { createDocumentClass } = await import(documentModule);
      const rpc = createRecordingRpc();
      const DocumentClass = createDocumentClass(await createStubContext(rpc));
      return { rpc, instance: new DocumentClass(reference("Document")) };
    }
  },
  {
    name: "WebviewPsLayer",
    type: "Layer",
    batchGetName: "layer.batchGet",
    batchSetName: "layer.batchSet",
    writableProp: "opacity",
    async build() {
      const { createLayerClass } = await import(layerModule);
      const rpc = createRecordingRpc();
      const LayerClass = createLayerClass(await createStubContext(rpc));
      return { rpc, instance: new LayerClass(reference("Layer")) };
    }
  },
  {
    name: "WebviewPsChannel",
    type: "Channel",
    batchGetName: "channel.batchGet",
    batchSetName: "channel.batchSet",
    writableProp: "opacity",
    async build() {
      const { createChannelClass } = await import(channelModule);
      const rpc = createRecordingRpc();
      const ChannelClass = createChannelClass(await createStubContext(rpc));
      return { rpc, instance: new ChannelClass(reference("Channel")) };
    }
  },
  {
    name: "WebviewPsColorSampler", type: "ColorSampler", batchGetName: "colorSampler.batchGet", batchSetName: "colorSampler.batchSet",
    async build() { const { createColorSamplerClass } = await import(colorSamplerModule); const rpc = createRecordingRpc(); const C = createColorSamplerClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("ColorSampler")) }; }
  },
  {
    name: "WebviewPsCountItem", type: "CountItem", batchGetName: "countItem.batchGet", batchSetName: "countItem.batchSet",
    async build() { const { createCountItemClass } = await import(countItemModule); const rpc = createRecordingRpc(); const C = createCountItemClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("CountItem")) }; }
  },
  {
    name: "WebviewPsLayerComp", type: "LayerComp", batchGetName: "layerComp.batchGet", batchSetName: "layerComp.batchSet", writableProp: "name",
    async build() { const { createLayerCompClass } = await import(layerCompModule); const rpc = createRecordingRpc(); const C = createLayerCompClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("LayerComp")) }; }
  },
  {
    name: "WebviewPsSelection",
    type: "Selection",
    batchGetName: "selection.batchGet",
    batchSetName: "selection.batchSet",
    async build() {
      const { createSelectionClass } = await import(selectionModule);
      const rpc = createRecordingRpc();
      const SelectionClass = createSelectionClass(await createStubContext(rpc));
      return { rpc, instance: new SelectionClass(reference("Selection")) };
    }
  },
  {
    name: "WebviewPsHistoryState",
    type: "HistoryState",
    batchGetName: "historyState.batchGet",
    batchSetName: "historyState.batchSet",
    async build() {
      const { createHistoryStateClass } = await import(historyStateModule);
      const rpc = createRecordingRpc();
      const HistoryStateClass = createHistoryStateClass(await createStubContext(rpc));
      return { rpc, instance: new HistoryStateClass(reference("HistoryState")) };
    }
  },
  {
    name: "WebviewPsGuide", type: "Guide", batchGetName: "guide.batchGet", batchSetName: "guide.batchSet", writableProp: "coordinate",
    async build() { const { createGuideClass } = await import(guideModule); const rpc = createRecordingRpc(); const C = createGuideClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("Guide")) }; }
  },
  {
    name: "WebviewPsPathItem", type: "PathItem", batchGetName: "pathItem.batchGet", batchSetName: "pathItem.batchSet", writableProp: "name",
    async build() { const { createPathItemClass } = await import(pathItemModule); const rpc = createRecordingRpc(); const C = createPathItemClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("PathItem")) }; }
  },
  {
    name: "WebviewPsSubPathItem", type: "SubPathItem", batchGetName: "subPathItem.batchGet", batchSetName: "subPathItem.batchSet",
    async build() { const { createSubPathItemClass } = await import(subPathItemModule); const rpc = createRecordingRpc(); const C = createSubPathItemClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("SubPathItem")) }; }
  },
  {
    name: "WebviewPsPathPoint", type: "PathPoint", batchGetName: "pathPoint.batchGet", batchSetName: "pathPoint.batchSet",
    async build() { const { createPathPointClass } = await import(pathPointModule); const rpc = createRecordingRpc(); const C = createPathPointClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("PathPoint")) }; }
  },
  {
    name: "WebviewTextItem", type: "TextItem", batchGetName: "textItem.batchGet", batchSetName: "textItem.batchSet", writableProp: "contents", readableProp: "typename", readOnlyProp: "typename",
    async build() { const { createTextItemClass } = await import(textModule); const rpc = createRecordingRpc(); const C = createTextItemClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("TextItem")) }; }
  },
  {
    name: "WebviewCharacterStyle", type: "CharacterStyle", batchGetName: "characterStyle.batchGet", batchSetName: "characterStyle.batchSet", writableProp: "size", readableProp: "size", readOnlyProp: "id",
    async build() { const { createCharacterStyleClass } = await import(textModule); const rpc = createRecordingRpc(); const C = createCharacterStyleClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("CharacterStyle")) }; }
  },
  {
    name: "WebviewParagraphStyle", type: "ParagraphStyle", batchGetName: "paragraphStyle.batchGet", batchSetName: "paragraphStyle.batchSet", writableProp: "leftIndent", readableProp: "leftIndent", readOnlyProp: "id",
    async build() { const { createParagraphStyleClass } = await import(textModule); const rpc = createRecordingRpc(); const C = createParagraphStyleClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("ParagraphStyle")) }; }
  },
  {
    name: "WebviewTextWarpStyle", type: "TextWarpStyle", batchGetName: "textWarpStyle.batchGet", batchSetName: "textWarpStyle.batchSet", writableProp: "bend", readableProp: "bend", readOnlyProp: "id",
    async build() { const { createTextWarpStyleClass } = await import(textModule); const rpc = createRecordingRpc(); const C = createTextWarpStyleClass(await createStubContext(rpc)); return { rpc, instance: new C(reference("TextWarpStyle")) }; }
  }
];

for (const testCase of CASES) {
  test(`${testCase.name} exposes only members backed by a configured RPC method`, async () => {
    const { instance } = await testCase.build();

    const members = ownMemberNames(instance).filter((name) => !BASE_MEMBERS.has(name));
    assert.ok(members.length > 0, `${testCase.name} should define at least one member.`);

    for (const name of members) {
      const error = await exerciseMember(instance, name);
      if (error) {
        assert.doesNotMatch(
          String(error.message ?? error),
          /No RPC method name configured/,
          `${testCase.name}.${name} must be backed by a configured RPC method name.`
        );
      }
    }
  });

  test(`${testCase.name} batch operations use the wired batch RPC names`, async () => {
    const { rpc, instance } = await testCase.build();
    const { type, batchGetName, batchSetName, writableProp } = testCase;
    const module = "photoshop-api/modules/photoshop";
    // Channel has no `id` scalar; read a property it actually exposes for the batchGet probe.
    const readableProp = testCase.readableProp ?? (type === "Channel" || type === "PathItem" || type === "LayerComp" ? "name" : type === "Selection" ? "solid" : type === "Guide" ? "coordinate" : type === "SubPathItem" || type === "PathPoint" || type === "ColorSampler" || type === "CountItem" ? "typename" : "id");

    await instance.batchGet([readableProp]);
    const batchGetCall = rpc.calls.find((call) => call.method === batchGetName);
    assert.ok(batchGetCall, `batchGet should call ${batchGetName}.`);
    assert.equal(batchGetCall.module, module, "batchGet should target the photoshop module.");
    assert.deepEqual(batchGetCall.args, [reference(type), [readableProp]]);

    if (writableProp !== undefined) {
      await instance.batchSet({ [writableProp]: 1 });
      const batchSetCall = rpc.calls.find((call) => call.method === batchSetName);
      assert.ok(batchSetCall, `batchSet should call ${batchSetName}.`);
      assert.equal(batchSetCall.args[0].type, type, "batchSet reference type");
      assert.deepEqual(batchSetCall.args[1], { [writableProp]: 1 });
    }
  });

  test(`${testCase.name} rejects a batchSet of a read-only property at runtime`, async () => {
    const { instance } = await testCase.build();
    // A read-only property on each proxy; the base guard should reject it even though the compile-time
    // signature already forbids it (belt and suspenders — see photoshop.test.ts @ts-expect-error).
    // Channel has no `id`, so use its read-only `histogram` instead.
    const readOnlyProp = testCase.readOnlyProp ?? (testCase.type === "Channel" ? "histogram" : testCase.type === "Selection" ? "solid" : testCase.type === "SubPathItem" || testCase.type === "PathPoint" || testCase.type === "ColorSampler" || testCase.type === "CountItem" ? "typename" : "id");
    await assert.rejects(
      instance.batchSet({ [readOnlyProp]: 1 }),
      new RegExp(`Cannot batchSet non-writable property: ${readOnlyProp}`)
    );
  });
}
