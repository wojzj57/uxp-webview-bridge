import assert from "node:assert/strict";
import { test } from "node:test";

const coreModule = "../../dist/webview/photoshop-api/modules/core/core.js";
const protocolModule = "../../dist/shared/photoshop-api/core-protocol.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/core/host.js";
const temporaryOwnerModule = "../../dist/uxp/photoshop-api/modules/core/temporary-document-owner.js";
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

test("core protocol fixes and accepts the complete 31-member Adobe baseline", async () => {
  const {
    ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES,
    PHOTOSHOP_CORE_CALLBACK_MEMBER_NAMES,
    PHOTOSHOP_CORE_METHOD_NAMES,
    isPhotoshopCoreMethodName
  } = await import(protocolModule);
  assert.equal(ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES.length, 31);
  assert.equal(new Set(ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES).size, 31);
  assert.equal(PHOTOSHOP_CORE_METHOD_NAMES.length, 31);
  assert.deepEqual(
    PHOTOSHOP_CORE_METHOD_NAMES.map((method) => method.slice("core.".length)),
    ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES
  );
  for (const method of PHOTOSHOP_CORE_METHOD_NAMES) {
    assert.equal(isPhotoshopCoreMethodName(method), true, `${method} should be accepted.`);
  }
  for (const callbackMember of PHOTOSHOP_CORE_CALLBACK_MEMBER_NAMES) {
    assert.equal(isPhotoshopCoreMethodName(`core.${callbackMember}`), true);
  }
});

test("WebView core namespace maps every query to its dedicated RPC", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const rpc = createRecordingRpc([
    2,
    { width: 200, height: 300 },
    { _obj: "labColor", luminance: 50, a: 0, b: 0 },
    { x: 10, y: 20 },
    { documentID: 99 },
    undefined,
    undefined,
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
    true,
    0.01,
    undefined,
    undefined,
    undefined,
    undefined,
    "Core Bridge Test"
  ]);
  const core = createCoreNamespace(rpc);

  await core.apiVersion;
  await core.calculateDialogSize({ preferredSize: { width: 200, height: 300 } });
  await core.convertColor({ _obj: "RGBColor", red: 128, green: 128, blue: 128 }, 6);
  await core.convertGlobalToLocal("panel-id", { x: 10, y: 20 });
  await core.createTemporaryDocument({ documentID: 7 });
  await core.deleteTemporaryDocument({ documentID: 99 });
  await core.endModalToolState(false);
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
  await core.performMenuCommand({ commandID: 1017 });
  await core.redrawDocument({ documentID: 7 });
  await core.setExecutionMode({ logRejections: true });
  await core.setUserIdleTime(3);
  await core.showAlert({ message: "Done" });
  await core.suppressResizeGripper({ type: "panel", target: "panel-id", value: true });
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
      {
        module: CORE_MODULE_ID,
        method: "core.convertGlobalToLocal",
        args: ["panel-id", { x: 10, y: 20 }]
      },
      { module: CORE_MODULE_ID, method: "core.createTemporaryDocument", args: [{ documentID: 7 }] },
      { module: CORE_MODULE_ID, method: "core.deleteTemporaryDocument", args: [{ documentID: 99 }] },
      { module: CORE_MODULE_ID, method: "core.endModalToolState", args: [false] },
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
      { module: CORE_MODULE_ID, method: "core.performMenuCommand", args: [{ commandID: 1017 }] },
      { module: CORE_MODULE_ID, method: "core.redrawDocument", args: [{ documentID: 7 }] },
      { module: CORE_MODULE_ID, method: "core.setExecutionMode", args: [{ logRejections: true }] },
      { module: CORE_MODULE_ID, method: "core.setUserIdleTime", args: [3] },
      { module: CORE_MODULE_ID, method: "core.showAlert", args: [{ message: "Done" }] },
      {
        module: CORE_MODULE_ID,
        method: "core.suppressResizeGripper",
        args: [{ type: "panel", target: "panel-id", value: true }]
      },
      { module: CORE_MODULE_ID, method: "core.translateUIString", args: ["$$$/Test=Test"] }
    ]
  );
});

test("host core adapter normalizes documented result shapes and honors per-method modal policy", async () => {
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
    executeAsModal(fn, options) {
      calls.push(["executeAsModal", options.commandName]);
      return fn({});
    },
    convertGlobalToLocal(target, location) {
      calls.push(["convertGlobalToLocal", target, location]);
      return Promise.resolve({ x: location.x - 1, y: location.y - 2 });
    },
    createTemporaryDocument(options) {
      calls.push(["createTemporaryDocument", options]);
      return Promise.resolve({ documentID: 99 });
    },
    deleteTemporaryDocument(options) {
      calls.push(["deleteTemporaryDocument", options]);
      return Promise.resolve();
    },
    endModalToolState(commit) {
      calls.push(["endModalToolState", commit]);
      return Promise.resolve();
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
    performMenuCommand(options) {
      calls.push(["performMenuCommand", options]);
      return Promise.resolve({ available: true, userCancelled: false });
    },
    redrawDocument(options) {
      calls.push(["redrawDocument", options]);
      return Promise.resolve(0.0125);
    },
    setExecutionMode(options) {
      calls.push(["setExecutionMode", options]);
      return Promise.resolve();
    },
    setUserIdleTime(value) {
      calls.push(["setUserIdleTime", value]);
      return Promise.resolve();
    },
    showAlert(options) {
      calls.push(["showAlert", options]);
      return Promise.resolve();
    },
    suppressResizeGripper(options) {
      calls.push(["suppressResizeGripper", options]);
      return Promise.resolve();
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
    assert.deepEqual(
      await dispatchCoreCall("core.convertGlobalToLocal", ["panel-id", { x: 10, y: 20 }]),
      { x: 9, y: 18 }
    );
    assert.deepEqual(
      await dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 7 }]),
      { documentID: 99 }
    );
    await dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 99 }]);
    await dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 99 }]);
    assert.equal(await dispatchCoreCall("core.endModalToolState", [false]), undefined);
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
    assert.equal(await dispatchCoreCall("core.performMenuCommand", [{ commandID: 1017 }]), true);
    assert.equal(await dispatchCoreCall("core.redrawDocument", [{ documentID: 7 }]), 0.0125);
    assert.equal(
      await dispatchCoreCall("core.setExecutionMode", [{ enableErrorStacktraces: true }]),
      undefined
    );
    assert.equal(await dispatchCoreCall("core.setUserIdleTime", [3]), undefined);
    assert.equal(await dispatchCoreCall("core.showAlert", [{ message: "Done" }]), undefined);
    assert.equal(
      await dispatchCoreCall("core.suppressResizeGripper", [
        { type: "panel", target: "panel-id", value: true }
      ]),
      undefined
    );
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
    ["convertGlobalToLocal", "panel-id", { x: 10, y: 20 }],
    ["executeAsModal", "core.createTemporaryDocument"],
    ["createTemporaryDocument", { documentID: 7 }],
    ["executeAsModal", "core.deleteTemporaryDocument"],
    ["deleteTemporaryDocument", { documentID: 99 }],
    ["endModalToolState", false],
    ["getMenuCommandState", { commandID: 1017 }],
    ["getMenuCommandTitle", { menuID: 100 }],
    ["historySuspended", { documentID: 7 }],
    ["performMenuCommand", { commandID: 1017 }],
    ["executeAsModal", "core.redrawDocument"],
    ["redrawDocument", { documentID: 7 }],
    ["setExecutionMode", { enableErrorStacktraces: true }],
    ["setUserIdleTime", 3],
    ["showAlert", { message: "Done" }],
    ["suppressResizeGripper", { type: "panel", target: "panel-id", value: true }],
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
    assert.throws(
      () => dispatchCoreCall("core.convertGlobalToLocal", ["", { x: 1, y: 2 }]),
      /target must be a non-empty string/
    );
    assert.throws(
      () => dispatchCoreCall("core.convertGlobalToLocal", ["panel-id", { x: Number.NaN, y: 2 }]),
      /location\.x must be a finite number/
    );
    assert.throws(
      () => dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 0 }]),
      /documentID must be greater than zero/
    );
    assert.throws(
      () => dispatchCoreCall("core.endModalToolState", ["false"]),
      /commit must be a boolean/
    );
    assert.throws(
      () => dispatchCoreCall("core.performMenuCommand", [{ commandID: 1, scheduling: { timeOut: -1 } }]),
      /timeOut must be zero or greater/
    );
    assert.throws(
      () => dispatchCoreCall("core.setExecutionMode", [{}]),
      /must set enableErrorStacktraces or logRejections/
    );
    assert.throws(
      () => dispatchCoreCall("core.setUserIdleTime", [-1]),
      /idleTime must be zero or greater/
    );
    assert.throws(
      () => dispatchCoreCall("core.showAlert", [{ message: "" }]),
      /message must be a non-empty string/
    );
    assert.throws(
      () => dispatchCoreCall("core.suppressResizeGripper", [
        { type: "dialog", target: "panel-id", value: true }
      ]),
      /type must be panel/
    );
  });
});

test("host reports a stable coded error when a Photoshop Core method is unavailable", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  await withPhotoshopCore({ apiVersion: 2 }, async () => {
    assert.throws(
      () => dispatchCoreCall("core.convertGlobalToLocal", ["panel-id", { x: 1, y: 2 }]),
      (error) => {
        assert.equal(error.name, "BridgeRemoteError");
        assert.equal(error.code, "ERR_PHOTOSHOP_CORE_UNSUPPORTED");
        assert.match(error.message, /Photoshop 26\.0 or newer/);
        return true;
      }
    );
    await assert.rejects(
      dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 12345 }]),
      (error) => {
        assert.equal(error.code, "ERR_PHOTOSHOP_CORE_TEMPORARY_DOCUMENT_NOT_OWNED");
        return true;
      }
    );
  });
});

test("temporary document owner merges deletes, keeps tombstones, runs fixed timers, and awaits destroy", async () => {
  const { createTemporaryDocumentOwner } = await import(temporaryOwnerModule);
  const scheduled = [];
  const cleared = [];
  const deleted = [];
  const owner = createTemporaryDocumentOwner({
    ttlMs: 1234,
    setTimeoutFn(callback, timeoutMs) {
      const handle = { callback, timeoutMs };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      cleared.push(handle);
    }
  });

  owner.register(10, async () => {
    deleted.push(10);
  });
  assert.equal(scheduled[0].timeoutMs, 1234);
  const firstDelete = owner.delete(10);
  const concurrentDelete = owner.delete(10);
  assert.deepEqual(await Promise.all([firstDelete, concurrentDelete]), ["deleted", "deleted"]);
  assert.deepEqual(deleted, [10], "concurrent delete calls must share one native deletion");
  assert.equal(await owner.delete(10), "already-deleted");
  assert.equal(await owner.delete(999), "not-owned");
  assert.equal(cleared.length, 1);

  owner.register(11, async () => {
    deleted.push(11);
  });
  scheduled.at(-1).callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await owner.delete(11), "already-deleted");

  owner.register(12, async () => {
    await Promise.resolve();
    deleted.push(12);
  });
  await owner.destroy();
  assert.equal(await owner.delete(12), "already-deleted");
  assert.deepEqual(deleted, [10, 11, 12]);
});

test("temporary document creation registers release-all cleanup and deletes an abort-race result", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  const controller = new AbortController();
  const calls = [];
  let cleanup;
  let resolveCreate;
  const callbacks = {
    activeModalSessionId: undefined,
    invoke: () => Promise.reject(new Error("unused")),
    registerSubscription(id, value) {
      assert.equal(id, "photoshop.core.temporary-documents");
      cleanup = value;
    },
    unregisterSubscription: () => Promise.resolve(),
    openModalSession() {
      throw new Error("unused");
    }
  };
  const context = {
    operationId: "create-temp",
    callbacks,
    signal: controller.signal
  };
  const core = {
    apiVersion: 2,
    executeAsModal(fn, options) {
      calls.push(["executeAsModal", options.commandName]);
      return fn({});
    },
    createTemporaryDocument() {
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    },
    deleteTemporaryDocument(options) {
      calls.push(["deleteTemporaryDocument", options]);
      return Promise.resolve();
    }
  };

  await withPhotoshopCore(core, async () => {
    const pending = dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 7 }], context);
    assert.equal(typeof cleanup, "function", "create must register release-all cleanup before native work");
    controller.abort();
    resolveCreate({ documentID: 500 });
    await assert.rejects(pending, (error) => {
      assert.equal(error.code, "ERR_PHOTOSHOP_CORE_OPERATION_ABORTED");
      return true;
    });
    assert.deepEqual(calls.at(-1), ["deleteTemporaryDocument", { documentID: 500 }]);
    await cleanup();

    const liveContext = {
      ...context,
      operationId: "create-temp-live",
      signal: new AbortController().signal
    };
    core.createTemporaryDocument = () => Promise.resolve({ documentID: 501 });
    assert.deepEqual(
      await dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 7 }], liveContext),
      { documentID: 501 }
    );
    await cleanup();
    assert.deepEqual(calls.at(-1), ["deleteTemporaryDocument", { documentID: 501 }]);
    await assert.rejects(
      dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 501 }], liveContext),
      (error) => error.code === "ERR_PHOTOSHOP_CORE_TEMPORARY_DOCUMENT_NOT_OWNED"
    );
  });
});
