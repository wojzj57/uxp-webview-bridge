import assert from "node:assert/strict";
import { test } from "node:test";

const remoteResultModule = "../../dist/webview/uxp-api/remote/remote-result.js";
const photoshopModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";

const reference = (type, id) => ({ kind: "uxp.remote.ref", type, id });
const appReference = reference("Photoshop", "photoshop.app");

test("RemoteResult preserves direct await while forwarding deep members and methods", async () => {
  const { createRemoteResult } = await import(remoteResultModule);
  const child = {
    name: Promise.resolve("child"),
    caller: Promise.resolve("forwarded caller"),
    close: async () => "closed",
    nested: { value: Promise.resolve(42) }
  };
  const result = createRemoteResult(Promise.resolve({ child, createChild: async () => child }), undefined, "root");

  assert.equal(await result, await result, "direct await should resolve the original stable object");
  assert.equal(await result.child.name, "child");
  assert.equal(await result.child.caller, "forwarded caller");
  assert.equal(await result.child.nested.value, 42);
  assert.equal(await result.child.close(), "closed");
  assert.equal(await result.createChild().name, "child");
  assert.equal(await result.then((value) => value.child.name), "child");
});

test("RemoteResult supports queued property writes and recovers after a failed write is observed", async () => {
  const { createRemoteResult } = await import(remoteResultModule);
  const target = { value: 1 };
  const result = createRemoteResult(Promise.resolve(target), undefined, "target");

  result.value = 2;
  assert.equal(await result.value, 2);

  const readonly = Object.freeze({ value: 3 });
  const failed = createRemoteResult(Promise.resolve(readonly), undefined, "readonly");
  failed.value = 4;
  await assert.rejects(Promise.resolve(failed.value), /Cannot assign readonly\.value/);
  assert.equal(await failed.value, 3, "the scheduler should accept new operations after reporting the write failure");
});

test("RemoteResult reports nullable dereferences as BridgeRemoteError", async () => {
  const { createRemoteResult } = await import(remoteResultModule);
  const result = createRemoteResult(Promise.resolve(null), undefined, "nullable");

  assert.equal(await result, null, "direct await must preserve nullable results");
  await assert.rejects(
    Promise.resolve(result.name),
    (error) => error?.name === "BridgeRemoteError" && error?.code === "BRIDGE_NULL_REMOTE_RESULT"
  );
});

test("Photoshop remote references support old and new await forms, deep calls, and chained writes", async () => {
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const documentReference = reference("Document", "doc-1");
  const layerReference = reference("Layer", "layer-1");
  const calls = [];
  let pixelAspectRatio = 1;

  const rpc = {
    async call(module, method, args = []) {
      calls.push([module, method, args]);
      if (method === "app.propertyGet" && args[1] === "activeDocument") return documentReference;
      if (method === "app.createDocument") return documentReference;
      if (method === "document.propertyGet") {
        if (args[1] === "name") return "Chain.psd";
        if (args[1] === "pixelAspectRatio") return pixelAspectRatio;
        if (args[1] === "backgroundLayer") return layerReference;
      }
      if (method === "document.propertySet" && args[1] === "pixelAspectRatio") {
        pixelAspectRatio = args[2];
        return undefined;
      }
      if (method === "layer.propertyGet" && args[1] === "name") return "Background";
      return undefined;
    }
  };

  const { app } = createPhotoshopNamespace(rpc);
  const first = await app.activeDocument;
  const second = await app.activeDocument;
  assert.equal(first, second, "direct await should retain identity dedup");
  assert.equal(await (await app.activeDocument).name, "Chain.psd", "the legacy double-await form must remain valid");
  assert.equal(await app.activeDocument.name, "Chain.psd", "a remote property should be readable with one await");
  assert.equal(await app.activeDocument.backgroundLayer.name, "Background", "remote chains should support arbitrary depth");
  assert.equal(await app.createDocument({ name: "Created" }).name, "Chain.psd", "remote method results should remain chainable");
  await app.activeDocument.close();

  app.activeDocument.pixelAspectRatio = 2;
  assert.equal(await app.activeDocument.pixelAspectRatio, 2, "a later read must observe a chained property write");
  const setIndex = calls.findIndex(([, method]) => method === "document.propertySet");
  const finalGetIndex = calls.findLastIndex(([, method, args]) => method === "document.propertyGet" && args[1] === "pixelAspectRatio");
  assert.ok(setIndex >= 0 && finalGetIndex > setIndex, "the chained write must flush before the later read");
});

test("Photoshop nullable remote method results reject only when dereferenced", async () => {
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const rpc = { call: async (_module, method) => method === "app.createDocument" ? null : undefined };
  const { app } = createPhotoshopNamespace(rpc);

  assert.equal(await app.createDocument(), null);
  await assert.rejects(
    Promise.resolve(app.createDocument().name),
    (error) => error?.name === "BridgeRemoteError" && error?.code === "BRIDGE_NULL_REMOTE_RESULT"
  );
});

test("RemoteClass rejects members that collide with Promise chaining", async () => {
  const { RemoteClass } = await import("../../dist/webview/uxp-api/remote/remote-class.js");
  const config = {
    rpc: { call: async () => undefined },
    moduleId: "test",
    methodNames: { propertyGet: {}, propertySet: {}, method: {}, dispose: "dispose" },
    properties: { then: { writable: false } },
    methods: {}
  };
  class InvalidRemote extends RemoteClass {
    constructor() {
      super(config, reference("InvalidRemote", "invalid-1"));
    }
  }

  assert.throws(
    () => new InvalidRemote(),
    /Remote member then is reserved because chainable remote results implement the Promise interface/
  );
});
