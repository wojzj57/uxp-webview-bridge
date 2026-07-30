import assert from "node:assert/strict";
import { test } from "node:test";

const coreModule = "../../dist/webview/photoshop-api/modules/core/core.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/core/host.js";
const CORE_MODULE_ID = "photoshop-api/modules/core";

function withPhotoshopCore(core, run) {
  const originalRequire = globalThis.require;
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return { core };
  };
  return Promise.resolve().then(run).finally(() => {
    if (originalRequire === undefined) delete globalThis.require;
    else globalThis.require = originalRequire;
  });
}

test("WebView Core listeners are stable and modal calls are serial with a session facade", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const callbacks = new Map();
  const ids = new WeakMap();
  const calls = [];
  let nextId = 0;
  let activeModalSessionId;
  let running = 0;
  let maximumRunning = 0;
  const rpc = {
    get activeModalSessionId() { return activeModalSessionId; },
    retainCallback(callback) {
      let callbackId = ids.get(callback);
      if (!callbackId) {
        callbackId = `callback-${++nextId}`;
        ids.set(callback, callbackId);
      }
      callbacks.set(callbackId, callback);
      return { kind: "bridge.callback.ref", callbackId };
    },
    releaseCallback(reference) { callbacks.delete(reference.callbackId); },
    async call(module, method, args = []) {
      assert.equal(module, CORE_MODULE_ID);
      calls.push({ method, args });
      if (method !== "core.executeAsModal") return method === "modal.suspendHistory"
        ? { historySuspensionID: 41 }
        : undefined;
      assert.deepEqual(args[2].descriptor, { request: "bridge" });
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      activeModalSessionId = `session-${running}`;
      try {
        return await callbacks.get(args[0].callbackId)({ isCancelled: false }, { source: "native" });
      } finally {
        activeModalSessionId = undefined;
        running -= 1;
      }
    }
  };
  const core = createCoreNamespace(rpc);
  const listener = () => undefined;
  await Promise.all([
    core.addNotificationListener("photoshop", ["open", "close"], listener),
    core.addNotificationListener("photoshop", ["close", "open", "open"], listener)
  ]);
  assert.equal(calls.filter(({ method }) => method === "core.addNotificationListener").length, 1);
  await core.removeNotificationListener("photoshop", ["close", "open"], listener);
  await core.removeNotificationListener("photoshop", ["open", "close"], listener);
  assert.equal(calls.filter(({ method }) => method === "core.removeNotificationListener").length, 1);

  const results = await Promise.all([
    core.executeAsModal(async (executionContext, descriptor) => {
      assert.deepEqual(descriptor, { source: "native" });
      executionContext.reportProgress({ value: 0.5 });
      assert.deepEqual(
        await executionContext.hostControl.suspendHistory({ documentID: 7, name: "Edit" }),
        { historySuspensionID: 41 }
      );
      await assert.rejects(
        core.executeAsModal(() => undefined, { commandName: "nested" }),
        (error) => error.code === "ERR_NESTED_EXECUTE_AS_MODAL"
      );
      return "first";
    }, { commandName: "first", descriptor: { request: "bridge" } }),
    core.executeAsModal(async () => "second", { commandName: "second", descriptor: { request: "bridge" } })
  ]);
  assert.deepEqual(results, ["first", "second"]);
  assert.equal(maximumRunning, 1);
  assert.equal(calls.filter(({ method }) => method === "modal.reportProgress").length, 1);
});

test("WebView Core callback registrations are partitioned by RPC callback scope", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const makeOwner = (name) => ({
    name,
    activeModalSessionId: undefined,
    calls: [],
    call(module, method, args) { this.calls.push({ module, method, args }); return Promise.resolve(); },
    retainCallback() { return { kind: "bridge.callback.ref", callbackId: `${name}-listener` }; },
    releaseCallback() {}
  });
  const first = makeOwner("first");
  const second = makeOwner("second");
  let owner = first;
  const core = createCoreNamespace({
    get callbackScope() { return owner; },
    call(...args) { return owner.call(...args); }
  });
  const listener = () => undefined;
  await core.addNotificationListener("photoshop", ["open"], listener);
  owner = second;
  await core.addNotificationListener("photoshop", ["open"], listener);
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
  assert.notEqual(first.calls[0].args[2].callbackId, second.calls[0].args[2].callbackId);
});

test("WebView Core waits for listener removal before re-adding the same listener", async () => {
  const { createCoreNamespace } = await import(coreModule);
  let finishRemove;
  const removeGate = new Promise((resolve) => { finishRemove = resolve; });
  const calls = [];
  let nextId = 0;
  const rpc = {
    retainCallback() { return { kind: "bridge.callback.ref", callbackId: `race-${++nextId}` }; },
    releaseCallback() {},
    call(_module, method) {
      calls.push(method);
      return method === "core.removeNotificationListener" ? removeGate : Promise.resolve();
    }
  };
  const core = createCoreNamespace(rpc);
  const listener = () => undefined;
  await core.addNotificationListener("photoshop", ["open"], listener);
  const removing = core.removeNotificationListener("photoshop", ["open"], listener);
  await Promise.resolve();
  const readding = core.addNotificationListener("photoshop", ["open"], listener);
  await Promise.resolve();
  assert.equal(calls.filter((method) => method === "core.addNotificationListener").length, 1);
  finishRemove();
  await Promise.all([removing, readding]);
  assert.equal(calls.filter((method) => method === "core.addNotificationListener").length, 2);
});

test("WebView Core preserves the target error when queued progress also fails", async () => {
  const { createCoreNamespace } = await import(coreModule);
  const callbacks = new Map();
  let nextId = 0;
  const rpc = {
    retainCallback(callback) {
      const callbackId = `error-callback-${++nextId}`;
      callbacks.set(callbackId, callback);
      return { kind: "bridge.callback.ref", callbackId };
    },
    releaseCallback(reference) {
      callbacks.delete(reference.callbackId);
    },
    async call(_module, method, args = []) {
      if (method === "modal.reportProgress") throw new Error("progress failed");
      if (method === "core.executeAsModal") {
        return callbacks.get(args[0].callbackId)({ isCancelled: false });
      }
      return undefined;
    }
  };
  const core = createCoreNamespace(rpc);
  await assert.rejects(
    core.executeAsModal((context) => {
      context.reportProgress({ value: 0.5 });
      throw new Error("target failed");
    }, { commandName: "error precedence" }),
    /target failed/
  );
});

function createCallbackBridge(callbacksById = new Map()) {
  const subscriptions = new Map();
  const invocations = [];
  let activeModalSessionId;
  return {
    subscriptions,
    invocations,
    get activeModalSessionId() { return activeModalSessionId; },
    invoke(reference, args, options) {
      invocations.push({ reference, args, options });
      const callback = callbacksById.get(reference.callbackId);
      return callback ? Promise.resolve(callback(...args)) : Promise.resolve(undefined);
    },
    registerSubscription(id, cleanup) { subscriptions.set(id, cleanup); },
    async unregisterSubscription(id) {
      const cleanup = subscriptions.get(id);
      subscriptions.delete(id);
      await cleanup?.();
    },
    openModalSession() {
      const sessionId = "modal-session";
      activeModalSessionId = sessionId;
      return {
        modalSessionId: sessionId,
        invoke(reference, args) {
          return Promise.resolve(callbacksById.get(reference.callbackId)(...args));
        },
        close() {
          activeModalSessionId = undefined;
          return Promise.resolve();
        }
      };
    }
  };
}

function createContext(callbacks, operationId, extra = {}) {
  return { callbacks, operationId, ...extra };
}

test("UXP Core preserves native listener identity and forwards modal host control", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  const nativeListenerCalls = [];
  let nativeListener;
  const hostControlCalls = [];
  const callbacksById = new Map([
    ["target", async (executionContext) => {
      assert.equal(executionContext.isCancelled, false);
      return "modal-result";
    }],
    ["cancel", (event) => hostControlCalls.push(["cancel", event])]
  ]);
  const callbacks = createCallbackBridge(callbacksById);
  const context = createContext(callbacks, "operation-1");
  const core = {
    apiVersion: 2,
    addNotificationListener(group, events, listener) {
      nativeListenerCalls.push(["add", group, events, listener]);
      nativeListener = listener;
    },
    removeNotificationListener(group, events, listener) {
      nativeListenerCalls.push(["remove", group, events, listener]);
    },
    executeAsModal(target, options) {
      assert.equal(options.commandName, "Bridge modal");
      assert.deepEqual(options.descriptor, { request: "bridge" });
      const nativeContext = {
        isCancelled: false,
        reportProgress(options) { hostControlCalls.push(["progress", options]); },
        hostControl: {
          suspendHistory(options) {
            hostControlCalls.push(["suspend", options]);
            return { historySuspensionID: 8 };
          },
          resumeHistory(...args) { hostControlCalls.push(["resume", ...args]); },
          registerAutoCloseDocument(id) { hostControlCalls.push(["register", id]); },
          unregisterAutoCloseDocument(id) { hostControlCalls.push(["unregister", id]); }
        }
      };
      const pending = target(nativeContext, { source: "native" });
      nativeContext.onCancel({ reason: "user" });
      return pending;
    }
  };

  await withPhotoshopCore(core, async () => {
    const listenerRef = { kind: "bridge.callback.ref", callbackId: "listener" };
    await dispatchCoreCall("core.addNotificationListener", ["photoshop", ["open"], listenerRef], context);
    nativeListener("open", { documentID: 7 });
    await Promise.resolve();
    assert.deepEqual(callbacks.invocations.at(-1).args, ["open", { documentID: 7 }]);
    await dispatchCoreCall("core.removeNotificationListener", ["photoshop", ["open"], listenerRef], context);
    assert.equal(nativeListenerCalls[0][3], nativeListenerCalls[1][3]);

    callbacksById.set("target", async () => {
      assert.deepEqual(
        await dispatchCoreCall("modal.suspendHistory", [{ documentID: 7, name: "Edit" }],
          createContext(callbacks, "nested-1", { modalSessionId: "modal-session" })),
        { historySuspensionID: 8 }
      );
      await dispatchCoreCall("modal.reportProgress", [{ value: 0.75 }],
        createContext(callbacks, "nested-2", { modalSessionId: "modal-session" }));
      return "modal-result";
    });
    assert.equal(
      await dispatchCoreCall("core.executeAsModal", [
        { kind: "bridge.callback.ref", callbackId: "target" },
        { kind: "bridge.callback.ref", callbackId: "cancel" },
        { commandName: "Bridge modal", descriptor: { request: "bridge" } }
      ], context),
      "modal-result"
    );
    assert.deepEqual(Object.fromEntries(hostControlCalls), {
      suspend: { documentID: 7, name: "Edit" },
      cancel: { reason: "user" },
      progress: { value: 0.75 }
    });
  });
});

test("UXP Core coalesces concurrent native listener registration", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  let resolveAdd;
  let addCalls = 0;
  const callbacks = createCallbackBridge();
  const context = createContext(callbacks, "listener-concurrency");
  const reference = { kind: "bridge.callback.ref", callbackId: "shared-listener" };
  const core = {
    apiVersion: 2,
    addNotificationListener() {
      addCalls += 1;
      return new Promise((resolve) => { resolveAdd = resolve; });
    },
    removeNotificationListener() {}
  };
  await withPhotoshopCore(core, async () => {
    const first = dispatchCoreCall("core.addNotificationListener", ["photoshop", ["open"], reference], context);
    const second = dispatchCoreCall("core.addNotificationListener", ["photoshop", ["open"], reference], context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(addCalls, 1);
    resolveAdd();
    await Promise.all([first, second]);
    await dispatchCoreCall("core.removeNotificationListener", ["photoshop", ["open"], reference], context);
  });
});

test("UXP Core serializes listener removal and re-addition", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  let resolveRemove;
  const removeGate = new Promise((resolve) => { resolveRemove = resolve; });
  let addCalls = 0;
  const callbacks = createCallbackBridge();
  const context = createContext(callbacks, "listener-readd");
  const reference = { kind: "bridge.callback.ref", callbackId: "readded-listener" };
  const core = {
    apiVersion: 2,
    addNotificationListener() { addCalls += 1; },
    removeNotificationListener() { return removeGate; }
  };
  await withPhotoshopCore(core, async () => {
    await dispatchCoreCall("core.addNotificationListener", ["photoshop", ["open"], reference], context);
    const removing = dispatchCoreCall("core.removeNotificationListener", ["photoshop", ["open"], reference], context);
    await Promise.resolve();
    const readding = dispatchCoreCall("core.addNotificationListener", ["photoshop", ["open"], reference], context);
    await Promise.resolve();
    assert.equal(addCalls, 1);
    resolveRemove();
    await Promise.all([removing, readding]);
    assert.equal(addCalls, 2);
  });
});

test("UXP modal release subscription waits for native executeAsModal settlement", async () => {
  const { dispatchCoreCall } = await import(hostModule);
  let resolveNative;
  const callbacks = createCallbackBridge(new Map([
    ["target", () => "unused"],
    ["cancel", () => undefined]
  ]));
  const context = createContext(callbacks, "long-modal");
  const core = {
    apiVersion: 2,
    executeAsModal() {
      return new Promise((resolve) => { resolveNative = resolve; });
    }
  };
  await withPhotoshopCore(core, async () => {
    const modal = dispatchCoreCall("core.executeAsModal", [
      { kind: "bridge.callback.ref", callbackId: "target" },
      { kind: "bridge.callback.ref", callbackId: "cancel" },
      { commandName: "Long modal" }
    ], context);
    await new Promise((resolve) => setImmediate(resolve));
    const subscriptionId = [...callbacks.subscriptions.keys()].find((id) => id.startsWith("photoshop.core.modal:"));
    assert.ok(subscriptionId);
    let released = false;
    const release = callbacks.unregisterSubscription(subscriptionId).then(() => { released = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(released, false);
    resolveNative("done");
    await release;
    assert.equal(await modal, "done");
  });
});

test("temporary-document ownership is isolated per bridge and active sessions avoid nested native modal calls", async () => {
  const { destroyCoreAdapter, dispatchCoreCall } = await import(hostModule);
  const bridgeA = createCallbackBridge();
  const bridgeB = createCallbackBridge();
  Object.defineProperty(bridgeA, "activeModalSessionId", { get: () => "session-a" });
  const contextA = createContext(bridgeA, "create-a", { modalSessionId: "session-a" });
  const contextB = createContext(bridgeB, "delete-b");
  let modalCalls = 0;
  let nextDocumentID = 700;
  const deleted = [];
  const core = {
    apiVersion: 2,
    executeAsModal(target) { modalCalls += 1; return target({}); },
    createTemporaryDocument() { return { documentID: ++nextDocumentID }; },
    deleteTemporaryDocument({ documentID }) { deleted.push(documentID); },
    redrawDocument() { return 0.01; }
  };
  await withPhotoshopCore(core, async () => {
    await dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 7 }], contextA);
    await dispatchCoreCall("core.redrawDocument", [{ documentID: 7 }], contextA);
    assert.equal(modalCalls, 0);
    await assert.rejects(
      dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 701 }], contextB),
      (error) => error.code === "ERR_PHOTOSHOP_CORE_TEMPORARY_DOCUMENT_NOT_OWNED"
    );
    await dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 701 }], contextA);
    assert.equal(modalCalls, 0);
    await dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 8 }], contextB);
    await bridgeB.unregisterSubscription("photoshop.core.temporary-documents");
    assert.deepEqual(deleted, [701, 702]);
    await dispatchCoreCall("core.createTemporaryDocument", [{ documentID: 9 }], contextB);
    assert.equal(bridgeB.subscriptions.has("photoshop.core.temporary-documents"), true);
    await dispatchCoreCall("core.deleteTemporaryDocument", [{ documentID: 703 }], contextB);
    await destroyCoreAdapter();
    assert.deepEqual(deleted, [701, 702, 703]);
  });
});
