import assert from "node:assert/strict";
import { test } from "node:test";

const coreModule = "../../dist/webview/photoshop-api/modules/core/core.js";
const protocolModule = "../../dist/shared/photoshop-api/core-protocol.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/core/host.js";
const CORE_MODULE_ID = "photoshop-api/modules/core";

function createRecordingRpc(results) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    call(module, method, args) {
      calls.push({ module, method, args });
      return Promise.resolve(queue.shift());
    }
  };
}

function withPhotoshopCore(core, run) {
  const originalRequire = globalThis.require;
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return { core };
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (originalRequire === undefined) {
        delete globalThis.require;
      } else {
        globalThis.require = originalRequire;
      }
    });
}

test("core protocol accepts the complete non-mutating method set", async () => {
  const { PHOTOSHOP_CORE_METHOD_NAMES, isPhotoshopCoreMethodName } = await import(protocolModule);
  assert.equal(PHOTOSHOP_CORE_METHOD_NAMES.length, 18);
  for (const method of PHOTOSHOP_CORE_METHOD_NAMES) {
    assert.equal(isPhotoshopCoreMethodName(method), true, `${method} should be accepted.`);
  }
  assert.equal(isPhotoshopCoreMethodName("core.executeAsModal"), false);
});

test("WebView core namespace maps every query to its dedicated RPC", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const rpc = createRecordingRpc([
    2,
    { width: 200, height: 300 },
    { _obj: "labColor", luminance: 50, a: 0, b: 0 },
    { title: "Move Tool" },
    { vendor: "Intel" },
    [],
    {},
    { list: [] },
    { list: [] },
    { list: [] },
    { list: [] },
    true,
    "Select All",
    { _obj: "pluginInfo" },
    3,
    false,
    false,
    "Core Bridge Test"
  ]);
  const core = createCoreNamespace(rpc);

  await core.apiVersion;
  await core.calculateDialogSize({ preferredSize: { width: 200, height: 300 } });
  await core.convertColor({ _obj: "RGBColor", red: 128, green: 128, blue: 128 }, 6);
  await core.getActiveTool();
  await core.getCPUInfo();
  await core.getDisplayConfiguration();
  await core.getGPUInfo();
  await core.getLayerGroupContents({ documentID: 7, layerID: 8 });
  await core.getLayerGroupContentsSync({ documentID: 7, layerID: 8 });
  await core.getLayerTree({ documentID: 7 });
  await core.getLayerTreeSync({ documentID: 7 });
  await core.getMenuCommandState({ commandID: 1017 });
  await core.getMenuCommandTitle({ menuID: 100 });
  await core.getPluginInfo();
  await core.getUserIdleTime();
  await core.historySuspended({ documentID: 7 });
  await core.isModal();
  await core.translateUIString("$$$/Test=Test");

  assert.deepEqual(
    rpc.calls.map(({ module, method, args }) => ({ module, method, args })),
    [
      { module: CORE_MODULE_ID, method: "core.apiVersion", args: undefined },
      {
        module: CORE_MODULE_ID,
        method: "core.calculateDialogSize",
        args: [{ preferredSize: { width: 200, height: 300 } }]
      },
      {
        module: CORE_MODULE_ID,
        method: "core.convertColor",
        args: [{ _obj: "RGBColor", red: 128, green: 128, blue: 128 }, 6]
      },
      { module: CORE_MODULE_ID, method: "core.getActiveTool", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getCPUInfo", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getDisplayConfiguration", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getGPUInfo", args: undefined },
      {
        module: CORE_MODULE_ID,
        method: "core.getLayerGroupContents",
        args: [{ documentID: 7, layerID: 8 }]
      },
      {
        module: CORE_MODULE_ID,
        method: "core.getLayerGroupContentsSync",
        args: [{ documentID: 7, layerID: 8 }]
      },
      { module: CORE_MODULE_ID, method: "core.getLayerTree", args: [{ documentID: 7 }] },
      { module: CORE_MODULE_ID, method: "core.getLayerTreeSync", args: [{ documentID: 7 }] },
      { module: CORE_MODULE_ID, method: "core.getMenuCommandState", args: [{ commandID: 1017 }] },
      { module: CORE_MODULE_ID, method: "core.getMenuCommandTitle", args: [{ menuID: 100 }] },
      { module: CORE_MODULE_ID, method: "core.getPluginInfo", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getUserIdleTime", args: undefined },
      { module: CORE_MODULE_ID, method: "core.historySuspended", args: [{ documentID: 7 }] },
      { module: CORE_MODULE_ID, method: "core.isModal", args: undefined },
      { module: CORE_MODULE_ID, method: "core.translateUIString", args: ["$$$/Test=Test"] }
    ]
  );
});

test("host core adapter normalizes documented result shapes without modal execution", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  const calls = [];
  const core = {
    apiVersion: 2,
    calculateDialogSize(options) {
      calls.push(["calculateDialogSize", options]);
      return Promise.resolve({ width: 200, height: 300 });
    },
    convertColor(sourceColor, targetModel) {
      calls.push(["convertColor", sourceColor, targetModel]);
      return { _obj: "labColor", luminance: 50, a: 0, b: 0 };
    },
    getActiveTool() {
      return Promise.resolve({ title: "Move Tool", isModal: false, key: "moveTool", classId: "moveTool" });
    },
    getCPUInfo() {
      return { vendor: "Intel", physicalCores: 4, logicalCores: 8, frequencyMhz: 3000 };
    },
    getDisplayConfiguration(options) {
      calls.push(["getDisplayConfiguration", options]);
      return Promise.resolve([]);
    },
    getGPUInfo() {
      return {};
    },
    getLayerGroupContents(options) {
      calls.push(["getLayerGroupContents", options]);
      return Promise.resolve({ list: [] });
    },
    getLayerGroupContentsSync(options) {
      calls.push(["getLayerGroupContentsSync", options]);
      return { list: [] };
    },
    getLayerTree(options) {
      calls.push(["getLayerTree", options]);
      return Promise.resolve({ list: [{ name: "Group", layerID: 8, layerKind: 7, list: [] }] });
    },
    getLayerTreeSync(options) {
      calls.push(["getLayerTreeSync", options]);
      return { list: [{ name: "Pixel", layerID: 9, kind: "pixel" }] };
    },
    getMenuCommandState(options) {
      calls.push(["getMenuCommandState", options]);
      return Promise.resolve([true]);
    },
    getMenuCommandTitle(options) {
      calls.push(["getMenuCommandTitle", options]);
      return ["Select All"];
    },
    getPluginInfo() {
      return Promise.resolve({ _obj: "pluginInfo" });
    },
    getUserIdleTime() {
      return Promise.resolve(4);
    },
    historySuspended(options) {
      calls.push(["historySuspended", options]);
      return Promise.resolve(false);
    },
    isModal() {
      return false;
    },
    translateUIString(value) {
      calls.push(["translateUIString", value]);
      return "Test";
    }
  };

  await withPhotoshopCore(core, async () => {
    assert.equal(dispatchCoreCall("core.apiVersion", []), 2);
    assert.deepEqual(
      await dispatchCoreCall("core.calculateDialogSize", [
        { preferredSize: { width: 200, height: 300 } }
      ]),
      { width: 200, height: 300 }
    );
    assert.deepEqual(
      dispatchCoreCall("core.convertColor", [
        { _obj: "RGBColor", red: 128, green: 128, blue: 128 },
        6
      ]),
      { _obj: "labColor", luminance: 50, a: 0, b: 0 }
    );
    assert.deepEqual(await dispatchCoreCall("core.getActiveTool", []), {
      title: "Move Tool",
      isModal: false,
      key: "moveTool",
      classID: "moveTool"
    });
    assert.equal(await dispatchCoreCall("core.getMenuCommandState", [{ commandID: 1017 }]), true);
    assert.equal(await dispatchCoreCall("core.getMenuCommandTitle", [{ menuID: 100 }]), "Select All");
    assert.equal(await dispatchCoreCall("core.getUserIdleTime", []), 4);
    assert.equal(await dispatchCoreCall("core.historySuspended", [{ documentID: 7 }]), false);
    assert.equal(dispatchCoreCall("core.isModal", []), false);
    assert.equal(dispatchCoreCall("core.translateUIString", ["$$$/Test=Test"]), "Test");
    assert.deepEqual(await dispatchCoreCall("core.getDisplayConfiguration", []), []);
    assert.deepEqual(
      await dispatchCoreCall("core.getLayerGroupContents", [{ documentID: 7, layerID: 8 }]),
      { list: [] }
    );
    assert.deepEqual(
      dispatchCoreCall("core.getLayerGroupContentsSync", [{ documentID: 7, layerID: 8 }]),
      { list: [] }
    );
    assert.deepEqual(await dispatchCoreCall("core.getLayerTree", [{ documentID: 7 }]), {
      list: [{ name: "Group", layerID: 8, kind: 7, layers: [] }]
    });
    assert.deepEqual(dispatchCoreCall("core.getLayerTreeSync", [{ documentID: 7 }]), {
      list: [{ name: "Pixel", layerID: 9, kind: "pixel" }]
    });
  });

  assert.deepEqual(calls, [
    ["calculateDialogSize", { preferredSize: { width: 200, height: 300 } }],
    ["convertColor", { _obj: "RGBColor", red: 128, green: 128, blue: 128 }, 6],
    ["getMenuCommandState", { commandID: 1017 }],
    ["getMenuCommandTitle", { menuID: 100 }],
    ["historySuspended", { documentID: 7 }],
    ["translateUIString", "$$$/Test=Test"],
    ["getDisplayConfiguration", {}],
    ["getLayerGroupContents", { documentID: 7, layerID: 8 }],
    ["getLayerGroupContentsSync", { documentID: 7, layerID: 8 }],
    ["getLayerTree", { documentID: 7 }],
    ["getLayerTreeSync", { documentID: 7 }]
  ]);
});

test("host core adapter rejects malformed options before native calls", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  await withPhotoshopCore({}, async () => {
    assert.throws(
      () => dispatchCoreCall("core.getMenuCommandState", [{ commandID: "1017" }]),
      /options\.commandID must be an integer/
    );
    assert.throws(
      () => dispatchCoreCall("core.getMenuCommandTitle", [{ commandID: 1, menuID: 2 }]),
      /exactly one of commandID or menuID/
    );
    assert.throws(
      () => dispatchCoreCall("core.historySuspended", [{}]),
      /options\.documentID must be an integer/
    );
    assert.throws(
      () => dispatchCoreCall("core.calculateDialogSize", [{ preferredSize: { width: 0, height: 10 } }]),
      /width must be greater than zero/
    );
    assert.throws(
      () => dispatchCoreCall("core.convertColor", [{ _obj: "RGBColor" }, 99]),
      /supported ColorConversionModel/
    );
    assert.throws(
      () => dispatchCoreCall("core.getLayerGroupContents", [{ documentID: 7, layerID: 1.5 }]),
      /options\.layerID must be an integer/
    );
  });
});
