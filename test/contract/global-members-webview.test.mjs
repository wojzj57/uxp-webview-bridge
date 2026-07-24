import assert from "node:assert/strict";
import { test } from "node:test";

function stubRpc() {
  const calls = [];
  return {
    calls,
    rpc: {
      call(module, method, args) {
        calls.push({ module, method, args });
        if (method === "length") {
          return Promise.resolve(2);
        }
        if (method === "key") {
          return Promise.resolve("first");
        }
        if (method === "getItem") {
          return Promise.resolve("value");
        }
        if (method === "read") {
          return Promise.resolve({ "text/plain": "hello" });
        }
        if (method === "readText") {
          return Promise.resolve("hello");
        }
        if (method === "randomUUID") {
          return Promise.resolve("00000000-0000-4000-8000-000000000000");
        }
        if (method === "getRandomValues") {
          return Promise.resolve(args[0]);
        }
        return Promise.resolve(undefined);
      }
    }
  };
}

test("WebView public API exposes remote global member namespaces", async () => {
  const mod = await import("../../dist/webview/index.js");

  assert.equal(typeof mod.clipboard.writeText, "function");
  assert.equal(typeof mod.crypto.randomUUID, "function");
  assert.equal(typeof mod.localStorage.getItem, "function");
  assert.equal(typeof mod.sessionStorage.getItem, "function");
  assert.equal(typeof mod.path.join, "function");
});

test("WebView clipboard namespace dispatches remote calls", async () => {
  const { createClipboardNamespace } = await import(
    "../../dist/webview/uxp-api/global-members/clipboard/index.js"
  );
  const { calls, rpc } = stubRpc();
  const clipboard = createClipboardNamespace(rpc);

  await clipboard.write({ "text/plain": "hello" });
  await clipboard.writeText("hello");
  assert.deepEqual(await clipboard.read(), { "text/plain": "hello" });
  assert.equal(await clipboard.readText(), "hello");

  assert.deepEqual(calls, [
    {
      module: "uxp-api/global-members/clipboard",
      method: "write",
      args: [{ "text/plain": "hello" }]
    },
    {
      module: "uxp-api/global-members/clipboard",
      method: "writeText",
      args: ["hello"]
    },
    {
      module: "uxp-api/global-members/clipboard",
      method: "read",
      args: undefined
    },
    {
      module: "uxp-api/global-members/clipboard",
      method: "readText",
      args: undefined
    }
  ]);
});

test("WebView storage namespaces expose async length and methods", async () => {
  const { createLocalStorageNamespace } = await import(
    "../../dist/webview/uxp-api/global-members/local-storage/index.js"
  );
  const { createSessionStorageNamespace } = await import(
    "../../dist/webview/uxp-api/global-members/session-storage/index.js"
  );
  const { calls, rpc } = stubRpc();
  const localStorage = createLocalStorageNamespace(rpc);
  const sessionStorage = createSessionStorageNamespace(rpc);

  assert.equal(await localStorage.length, 2);
  assert.equal(await localStorage.key(0), "first");
  assert.equal(await localStorage.getItem("first"), "value");
  await localStorage.setItem("first", "value");
  await localStorage.removeItem("first");
  await localStorage.clear();
  assert.equal(await sessionStorage.length, 2);

  assert.deepEqual(calls.map(({ module, method, args }) => [module, method, args]), [
    ["uxp-api/global-members/local-storage", "length", undefined],
    ["uxp-api/global-members/local-storage", "key", [0]],
    ["uxp-api/global-members/local-storage", "getItem", ["first"]],
    ["uxp-api/global-members/local-storage", "setItem", ["first", "value"]],
    ["uxp-api/global-members/local-storage", "removeItem", ["first"]],
    ["uxp-api/global-members/local-storage", "clear", undefined],
    ["uxp-api/global-members/session-storage", "length", undefined]
  ]);
});

test("WebView crypto namespace serializes typed arrays and returns a new typed array", async () => {
  const { createCryptoNamespace } = await import(
    "../../dist/webview/uxp-api/global-members/crypto/index.js"
  );
  const { calls, rpc } = stubRpc();
  const crypto = createCryptoNamespace(rpc);
  const input = new Uint16Array(new ArrayBuffer(12), 4, 2);
  input.set([17, 23]);

  const output = await crypto.getRandomValues(input);

  assert.ok(output instanceof Uint16Array);
  assert.notEqual(output, input);
  assert.equal(output.length, 2);
  assert.equal(output.byteOffset, 0);
  assert.equal(calls[0].module, "uxp-api/global-members/crypto");
  assert.equal(calls[0].method, "getRandomValues");
  assert.equal(calls[0].args[0].kind, "Uint16Array");
  assert.equal(calls[0].args[0].length, 2);
});
