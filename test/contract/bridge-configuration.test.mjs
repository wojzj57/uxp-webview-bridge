import assert from "node:assert/strict";
import { test } from "node:test";

const webviewEntrypoint = "../../dist/webview/index.js";
const uxpEntrypoint = "../../dist/uxp/index.js";
const configurationError =
  /uxp-webview-bridge is not configured\. Call configWebviewBridge\(\) before using bridge APIs\./;

test("WebView RPC namespaces require configWebviewBridge before use", async () => {
  const { os } = await import(webviewEntrypoint);

  assert.throws(
    () => os.platform(),
    configurationError
  );
});

test("forwarded fetch checks configWebviewBridge before async request work", async () => {
  const { fetch } = await import(webviewEntrypoint);

  assert.throws(() => {
    const result = fetch("https://example.com");
    void result.catch(() => {});
  }, configurationError);
});

test("configWebviewBridge logs successful configuration", async () => {
  const environment = installRuntimeEnvironment();

  try {
    const { configWebviewBridge } = await import(webviewEntrypoint);
    const runtime = configWebviewBridge({ target: environment.target });

    assert.deepEqual(environment.logs, [["[uxp-webview-bridge] WebView bridge configured."]]);
    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configUxpBridge logs successful configuration", async () => {
  const environment = installRuntimeEnvironment();

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    const runtime = configUxpBridge({ webview: { postMessage() {} } });

    assert.deepEqual(environment.logs, [["[uxp-webview-bridge] UXP bridge configured."]]);
    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configUxpBridge exposes the immutable normalized capability snapshot", async () => {
  const environment = installRuntimeEnvironment();
  let runtime;

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    const input = ["uxp.storage.all", "fs"];
    runtime = configUxpBridge({
      webview: { postMessage() {} },
      capabilities: input
    });
    input.push("os");

    assert.deepEqual(runtime.capabilities, [
      "fs",
      "uxp.storage.secureStorage",
      "uxp.storage.localFileSystem"
    ]);
    assert.equal(Object.isFrozen(runtime.capabilities), true);
  } finally {
    await runtime?.destroy();
    environment.restore();
  }
});

test("configUxpBridge rejects invalid capability input before listeners or success logging", async () => {
  const environment = installRuntimeEnvironment();

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);

    assert.throws(
      () => configUxpBridge({
        webview: { postMessage() {} },
        capabilities: { fs: true }
      }),
      TypeError
    );
    assert.equal(environment.listenerCount, 0);
    assert.deepEqual(environment.logs, []);
  } finally {
    environment.restore();
  }
});

test("WebView RPC namespaces require reconfiguration after destroy", async () => {
  const environment = installRuntimeEnvironment();

  try {
    const { configWebviewBridge, os } = await import(webviewEntrypoint);
    const runtime = configWebviewBridge({ target: environment.target });
    await runtime.destroy();

    assert.throws(() => os.platform(), configurationError);
  } finally {
    environment.restore();
  }
});

function installRuntimeEnvironment() {
  const originalWindow = globalThis.window;
  const originalLog = console.log;
  const listeners = new Set();
  const logs = [];

  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  console.log = (...args) => logs.push(args);

  return {
    logs,
    get listenerCount() {
      return listeners.size;
    },
    target: {
      postMessage(message) {
        if (message.type !== "bridge.release-all") return;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              data: { type: "bridge.success", operationId: message.operationId },
              origin: "plugin://test",
              source: null
            });
          }
        });
      }
    },
    restore() {
      console.log = originalLog;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  };
}
