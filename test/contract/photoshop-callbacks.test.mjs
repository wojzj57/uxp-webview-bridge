import assert from "node:assert/strict";
import { test } from "node:test";

const namespaceModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
const ref = (type, id) => ({ kind: "uxp.remote.ref", type, id });
const callbackRef = (callbackId) => ({ kind: "bridge.callback.ref", callbackId });

test("photoshop callbacks retain stable refs, isolate callback scope, and expose a complete suspendHistory facade", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  const documentRef = ref("Document", "doc-1");
  const callbackIds = new WeakMap();
  const callbacks = new Map();
  let nextCallbackId = 1;
  const scope = {
    retainCallback(callback) {
      let id = callbackIds.get(callback);
      if (!id) callbackIds.set(callback, id = `callback-${nextCallbackId++}`);
      const retained = callbacks.get(id);
      callbacks.set(id, { callback, count: (retained?.count ?? 0) + 1 });
      return callbackRef(id);
    },
    releaseCallback(reference) {
      const retained = callbacks.get(reference.callbackId);
      if (!retained || retained.count === 1) callbacks.delete(reference.callbackId);
      else retained.count -= 1;
    }
  };
  const calls = [];
  const rpc = {
    callbackScope: scope,
    async call(_module, method, args = []) {
      calls.push([method, args]);
      if (method === "app.propertyGet" && args[1] === "activeDocument") return documentRef;
      if (method === "document.suspendHistory") {
        const retained = callbacks.get(args[1].callbackId);
        await retained.callback({ isCancelled: false });
        return;
      }
      if (method === "document.modal.suspendHistory") return { historySuspensionID: 4 };
      return undefined;
    }
  };
  const photoshop = createPhotoshopNamespace(rpc);
  const document = await photoshop.app.activeDocument;
  const listener = () => {};

  await photoshop.action.addNotificationListener(["open", "open"], listener);
  await photoshop.action.addNotificationListener(["open"], listener);
  assert.equal(calls.filter(([method]) => method === "action.addNotificationListener").length, 1);
  await photoshop.action.removeNotificationListener(["open"], listener);
  await photoshop.action.removeNotificationListener(["open"], listener);
  assert.equal(calls.filter(([method]) => method === "action.removeNotificationListener").length, 1);

  let callbackDocument;
  await document.suspendHistory(async (context) => {
    callbackDocument = context.document;
    assert.equal(context.isCancelled, false);
    context.reportProgress({ value: 0.5, commandName: "Halfway" });
    assert.deepEqual(await context.hostControl.suspendHistory({ documentID: 7, name: "Nested" }), {
      historySuspensionID: 4
    });
    await context.document.flatten();
  }, "Bridge history");
  assert.equal(callbackDocument, document, "the callback must reuse the exact initiating PsDocument proxy");
  assert.equal(calls.some(([method]) => method === "document.flatten"), true);
  assert.equal(calls.some(([method]) => method === "document.modal.reportProgress"), true);
  assert.equal(callbacks.size, 0, "one-shot and removed callback refs must be released by their original owner");
});

test("WebView Action waits for listener removal before re-adding the same listener", async () => {
  const { createPhotoshopNamespace } = await import(namespaceModule);
  let finishRemove;
  const removeGate = new Promise((resolve) => { finishRemove = resolve; });
  const calls = [];
  let nextId = 0;
  const scope = {
    retainCallback() { return callbackRef(`action-race-${++nextId}`); },
    releaseCallback() {}
  };
  const photoshop = createPhotoshopNamespace({
    callbackScope: scope,
    call(_module, method) {
      calls.push(method);
      return method === "action.removeNotificationListener" ? removeGate : Promise.resolve();
    }
  });
  const listener = () => undefined;
  await photoshop.action.addNotificationListener(["open"], listener);
  const removing = photoshop.action.removeNotificationListener(["open"], listener);
  await Promise.resolve();
  const readding = photoshop.action.addNotificationListener(["open"], listener);
  await Promise.resolve();
  assert.equal(calls.filter((method) => method === "action.addNotificationListener").length, 1);
  finishRemove();
  await Promise.all([removing, readding]);
  assert.equal(calls.filter((method) => method === "action.addNotificationListener").length, 2);
});

test("Photoshop host serializes Action listener removal and re-addition", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  let finishRemove;
  const removeGate = new Promise((resolve) => { finishRemove = resolve; });
  let addCalls = 0;
  const subscriptions = new Map();
  const callbacks = {
    activeModalSessionId: undefined,
    invoke: () => Promise.resolve(),
    registerSubscription(id, cleanup) { subscriptions.set(id, cleanup); },
    async unregisterSubscription(id) {
      const cleanup = subscriptions.get(id);
      if (!cleanup) return;
      await cleanup();
      subscriptions.delete(id);
    },
    openModalSession() { throw new Error("not used"); }
  };
  globalThis.require = () => ({
    action: {
      addNotificationListener() { addCalls += 1; },
      removeNotificationListener() { return removeGate; }
    },
    app: { documents: [] }
  });
  const context = { capabilities: { photoshop: true }, operationId: "action-race", callbacks };
  const reference = callbackRef("action-race-listener");
  try {
    await dispatchPhotoshopCall("action.addNotificationListener", [["open"], reference], context);
    const removing = dispatchPhotoshopCall("action.removeNotificationListener", [["open"], reference], context);
    await Promise.resolve();
    const readding = dispatchPhotoshopCall("action.addNotificationListener", [["open"], reference], context);
    await Promise.resolve();
    assert.equal(addCalls, 1);
    finishRemove();
    await Promise.all([removing, readding]);
    assert.equal(addCalls, 2);
    await dispatchPhotoshopCall("action.removeNotificationListener", [["open"], reference], context);
  } finally {
    await destroyPhotoshopHandles();
    globalThis.require = originalRequire;
  }
});

test("Photoshop host listeners clean up natively and suspendHistory nested calls reuse the modal session", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const nativeCalls = [];
  let nativeActionListener;
  let nativeCompletionGate = Promise.resolve();
  const nativeContext = {
    isCancelled: false,
    onCancel: undefined,
    reportProgress(options) { nativeCalls.push(["reportProgress", options]); },
    hostControl: {
      suspendHistory(options) { nativeCalls.push(["hostControl.suspendHistory", options]); return { historySuspensionID: 9 }; },
      resumeHistory(options, commit) { nativeCalls.push(["hostControl.resumeHistory", options, commit]); },
      registerAutoCloseDocument(id) { nativeCalls.push(["hostControl.registerAutoCloseDocument", id]); },
      unregisterAutoCloseDocument(id) { nativeCalls.push(["hostControl.unregisterAutoCloseDocument", id]); }
    }
  };
  const document = {
    id: 7,
    flatten() { nativeCalls.push(["flatten"]); },
    async suspendHistory(callback, name) {
      nativeCalls.push(["suspendHistory", name]);
      await callback(nativeContext);
      await nativeCompletionGate;
    }
  };
  globalThis.require = (name) => {
    assert.equal(name, "photoshop");
    return {
      app: { activeDocument: document, documents: [document] },
      core: { executeAsModal: async (callback) => { nativeCalls.push(["executeAsModal"]); return callback({}); } },
      action: {
        async addNotificationListener(events, listener) { nativeCalls.push(["action.add", events]); nativeActionListener = listener; },
        async removeNotificationListener(events, listener) { nativeCalls.push(["action.remove", events]); assert.equal(listener, nativeActionListener); },
        batchPlay: async () => [], getIDFromString: () => 1, recordAction: () => {}
      }
    };
  };

  const subscriptions = new Map();
  const callbackHandlers = new Map();
  let activeSessionId;
  const callbacksBridge = {
    get activeModalSessionId() { return activeSessionId; },
    async invoke(reference, args, options) {
      const handler = callbackHandlers.get(reference.callbackId);
      return handler ? handler(args, options) : undefined;
    },
    registerSubscription(id, cleanup) {
      if (subscriptions.has(id)) throw new Error(`duplicate ${id}`);
      subscriptions.set(id, cleanup);
    },
    async unregisterSubscription(id) {
      const cleanup = subscriptions.get(id);
      if (!cleanup) return;
      subscriptions.delete(id);
      await cleanup();
    },
    openModalSession() {
      activeSessionId = "session-1";
      return {
        sessionId: activeSessionId,
        invoke: (reference, args) => callbacksBridge.invoke(reference, args, { sessionId: activeSessionId }),
        async close() { activeSessionId = undefined; }
      };
    }
  };
  const context = { capabilities: { photoshop: true }, operationId: "outer", callbacks: callbacksBridge };

  try {
    const documentReference = await dispatchPhotoshopCall("app.activeDocument", [], context);
    const listenerReference = callbackRef("listener");
    await dispatchPhotoshopCall("action.addNotificationListener", [["open"], listenerReference], context);
    nativeActionListener("open", { _obj: "open" });
    assert.equal(subscriptions.size, 1);
    await dispatchPhotoshopCall("action.removeNotificationListener", [["open"], listenerReference], context);
    assert.equal(nativeCalls.some(([name]) => name === "action.remove"), true);

    let cancelEvent;
    callbackHandlers.set("cancel", async ([event]) => { cancelEvent = event; });
    callbackHandlers.set("target", async ([state]) => {
      assert.deepEqual(state, { isCancelled: false });
      const nested = { ...context, operationId: "nested", modalSessionId: activeSessionId };
      await dispatchPhotoshopCall("document.flatten", [documentReference], nested);
      await dispatchPhotoshopCall("document.modal.reportProgress", [documentReference, { value: 0.25 }], nested);
      assert.deepEqual(
        await dispatchPhotoshopCall("document.modal.suspendHistory", [documentReference, { documentID: 7, name: "Nested" }], nested),
        { historySuspensionID: 9 }
      );
      nativeContext.onCancel({ reason: "escape" });
    });
    let releaseNativeCompletion;
    nativeCompletionGate = new Promise((resolve) => { releaseNativeCompletion = resolve; });
    const suspendRequest = dispatchPhotoshopCall(
      "document.suspendHistory",
      [documentReference, callbackRef("target"), callbackRef("cancel"), "One state"],
      context
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(cancelEvent, { reason: "escape" });
    const completionSubscriptionId = [...subscriptions.keys()].find((id) =>
      id.startsWith("photoshop.document.suspend-history:session-")
    );
    assert.ok(completionSubscriptionId);
    let releaseSettled = false;
    const release = callbacksBridge.unregisterSubscription(completionSubscriptionId).then(() => { releaseSettled = true; });
    await Promise.resolve();
    assert.equal(releaseSettled, false, "release-all cleanup must wait for native suspendHistory settlement");
    releaseNativeCompletion();
    await Promise.all([release, suspendRequest]);
    assert.equal(nativeCalls.some(([name]) => name === "executeAsModal"), false, "nested document calls must not open a second modal scope");
    assert.equal(nativeCalls.some(([name]) => name === "flatten"), true);
    assert.equal(nativeCalls.some(([name]) => name === "reportProgress"), true);
    assert.equal(activeSessionId, undefined);
  } finally {
    await destroyPhotoshopHandles();
    globalThis.require = originalRequire;
  }
});
