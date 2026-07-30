import assert from "node:assert/strict";
import { test } from "node:test";

test("two same-origin WebViews handshake, route, and tear down independently", async () => {
  const originalWindow = globalThis.window;
  const originalRequire = globalThis.require;
  const listeners = new Set();
  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  const nativeDocument = {
    id: 17,
    name: "epoch.psd",
    typename: "Document",
    layers: [],
    channels: []
  };
  globalThis.require = (moduleName) => {
    if (moduleName === "os") return { platform: () => "win32" };
    assert.equal(moduleName, "photoshop");
    return {
      app: { activeDocument: nativeDocument },
      core: { executeAsModal: (run) => Promise.resolve(run({})) }
    };
  };

  const dispatch = (source, data) => {
    for (const listener of [...listeners]) {
      listener({ source, origin: "https://same.example", data });
    }
  };
  const clientPostsA = [];
  const targetA = { postMessage: (message) => { clientPostsA.push(message); dispatch(elementA, message); } };
  const targetB = { postMessage: (message) => dispatch(elementB, message) };
  const elementA = { postMessage: (message) => dispatch(targetA, message) };
  const elementB = { postMessage: (message) => dispatch(targetB, message) };

  try {
    const [
      { configUxpBridge },
      { RpcClient },
      { createPhotoshopNamespace }
    ] = await Promise.all([
      import("../../dist/uxp/index.js"),
      import("../../dist/webview/rpc-client.js"),
      import("../../dist/webview/photoshop-api/modules/photoshop/photoshop.js")
    ]);
    const hostA = configUxpBridge({
      webview: elementA,
      allowedOrigins: ["https://same.example"],
      capabilities: ["os", "photoshop.dom"]
    });
    const hostB = configUxpBridge({
      webview: elementB,
      allowedOrigins: ["https://same.example"],
      capabilities: ["os", "photoshop.dom"]
    });
    const clientA = new RpcClient({
      target: targetA,
      handshake: true,
      allowedOrigins: ["https://same.example"]
    });
    const clientB = new RpcClient({
      target: targetB,
      handshake: true,
      allowedOrigins: ["https://same.example"]
    });

    await Promise.all([clientA.ready, clientB.ready]);
    assert.notEqual(clientA.activeBridgeSessionId, clientB.activeBridgeSessionId);
    assert.equal(await clientA.call("uxp-api/modules/os", "platform"), "win32");
    assert.equal(await clientB.call("uxp-api/modules/os", "platform"), "win32");

    const makePhotoshopRpc = (client) => ({
      get bridgeSessionId() { return client.activeBridgeSessionId ?? "bridge.connecting"; },
      call: (module, method, args) => client.call(module, method, args),
      bindReference: (reference) => client.bindReference(reference),
      assertReferenceActive: (reference) => client.assertReferenceActive(reference),
      get activeModalSessionId() { return client.activeModalSessionId; },
      callbackScope: client,
      retainCallback: (callback) => client.retainCallback(callback),
      releaseCallback: (reference) => client.releaseCallback(reference)
    });
    const photoshopA = createPhotoshopNamespace(makePhotoshopRpc(clientA));
    const photoshopB = createPhotoshopNamespace(makePhotoshopRpc(clientB));
    const documentA = await photoshopA.app.activeDocument;
    const documentB = await photoshopB.app.activeDocument;
    const channelsA = await documentA.channels;
    const callbackA = clientA.retainCallback(() => undefined);
    const sessionA = clientA.activeBridgeSessionId;
    assert.notEqual(documentA, documentB, "equal native ids must not deduplicate across sessions");

    await clientA.destroy();
    const postsAfterDestroy = clientPostsA.length;
    documentA.pixelAspectRatio = 2;
    await assert.rejects(
      documentA.batchGet(["name"]),
      (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
    );
    assert.equal(clientPostsA.length, postsAfterDestroy, "stale queued writes and reads must post zero messages");
    await assert.rejects(
      documentA.toRemoteReference(),
      (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
    );
    assert.equal(clientPostsA.length, postsAfterDestroy, "stale encoding must post zero messages");
    await assert.rejects(
      channelsA.removeAll(),
      (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
    );
    assert.equal(clientPostsA.length, postsAfterDestroy, "stale collections must post zero messages");
    elementA.postMessage({
      type: "bridge.callback.invoke",
      bridgeSessionId: sessionA,
      operationId: "late-callback",
      callbackId: callbackA.callbackId,
      args: []
    });
    await Promise.resolve();
    assert.equal(clientPostsA.length, postsAfterDestroy, "stale callbacks must post zero messages");
    assert.equal(await clientB.call("uxp-api/modules/os", "platform"), "win32");
    assert.equal(await documentB.name, "epoch.psd");
    await clientB.destroy();
    await Promise.all([hostA.destroy(), hostB.destroy()]);
  } finally {
    if (originalRequire === undefined) delete globalThis.require;
    else globalThis.require = originalRequire;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
