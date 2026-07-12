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

test("core protocol accepts the complete query method set", async () => {
  const { PHOTOSHOP_CORE_METHOD_NAMES, isPhotoshopCoreMethodName } = await import(protocolModule);
  assert.equal(PHOTOSHOP_CORE_METHOD_NAMES.length, 12);
  for (const method of PHOTOSHOP_CORE_METHOD_NAMES) {
    assert.equal(isPhotoshopCoreMethodName(method), true, `${method} should be accepted.`);
  }
  assert.equal(isPhotoshopCoreMethodName("core.executeAsModal"), false);
});

test("WebView core namespace maps every query to its dedicated RPC", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const rpc = createRecordingRpc([
    2,
    { title: "Move Tool" },
    { vendor: "Intel" },
    [],
    {},
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
  await core.getActiveTool();
  await core.getCPUInfo();
  await core.getDisplayConfiguration();
  await core.getGPUInfo();
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
      { module: CORE_MODULE_ID, method: "core.getActiveTool", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getCPUInfo", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getDisplayConfiguration", args: undefined },
      { module: CORE_MODULE_ID, method: "core.getGPUInfo", args: undefined },
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
  });

  assert.deepEqual(calls, [
    ["getMenuCommandState", { commandID: 1017 }],
    ["getMenuCommandTitle", { menuID: 100 }],
    ["historySuspended", { documentID: 7 }],
    ["translateUIString", "$$$/Test=Test"],
    ["getDisplayConfiguration", {}]
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
  });
});
