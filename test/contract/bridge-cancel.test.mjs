import assert from "node:assert/strict";
import { test } from "node:test";

const baseCapabilities = {
  fs: false,
  os: true,
  shell: true,
  userInfo: true,
  pluginManager: true,
  keyValueStorage: true,
  persistentFileStorage: true,
  xmp: true,
  photoshop: true,
  imaging: true,
  batchPlay: true
};

test("UXP module registry threads the abort signal into the dispatch context", async () => {
  const { createUxpModuleRegistry } = await import("../../dist/uxp/module-registry.js");
  const controller = new AbortController();
  let observedSignal;

  const adapter = {
    moduleId: "test/module",
    dispatch(_method, _args, context) {
      observedSignal = context.signal;
      return "ok";
    }
  };

  const registry = createUxpModuleRegistry(baseCapabilities, [adapter]);
  const result = registry.dispatch(
    { module: "test/module", method: "noop", args: [] },
    { signal: controller.signal }
  );

  assert.equal(result, "ok");
  assert.equal(observedSignal, controller.signal);
});

test("UXP module registry omits the signal when none is supplied", async () => {
  const { createUxpModuleRegistry } = await import("../../dist/uxp/module-registry.js");
  let observedContext;

  const adapter = {
    moduleId: "test/module",
    dispatch(_method, _args, context) {
      observedContext = context;
      return "ok";
    }
  };

  const registry = createUxpModuleRegistry(baseCapabilities, [adapter]);
  registry.dispatch({ module: "test/module", method: "noop", args: [] });

  assert.equal(observedContext.signal, undefined);
});

test("WebView RPC client posts a bridge.cancel envelope", async () => {
  const restoreWindow = installWindowStub();
  try {
    const { RpcClient } = await import("../../dist/webview/rpc-client.js");
    const posted = [];
    const client = new RpcClient({
      target: { postMessage: (message) => posted.push(message) },
      timeoutMs: 1
    });

    try {
      client.cancel("op-123");
      assert.equal(posted.length, 1);
      assert.deepEqual(posted[0], { type: "bridge.cancel", operationId: "op-123" });
    } finally {
      await client.destroy().catch(() => {});
    }
  } finally {
    restoreWindow();
  }
});

test("WebView RPC client callCancelable exposes the operation id", async () => {
  const restoreWindow = installWindowStub();
  try {
    const { RpcClient } = await import("../../dist/webview/rpc-client.js");
    const posted = [];
    const client = new RpcClient({
      target: { postMessage: (message) => posted.push(message) },
      timeoutMs: 1
    });

    try {
      const { operationId, promise } = client.callCancelable("m", "method", []);
      assert.equal(typeof operationId, "string");
      assert.equal(posted[0].operationId, operationId);
      assert.equal(posted[0].type, "bridge.call");
      promise.catch(() => {});
    } finally {
      await client.destroy().catch(() => {});
    }
  } finally {
    restoreWindow();
  }
});

function installWindowStub() {
  const originalWindow = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {}
  };
  return () => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  };
}
