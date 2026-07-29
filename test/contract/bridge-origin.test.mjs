import assert from "node:assert/strict";
import { test } from "node:test";

const uxpEntrypoint = "../../dist/uxp/index.js";
const webviewEntrypoint = "../../dist/webview/index.js";

const defaultOrigins = [
  "plugin://test",
  "plugin-data://test",
  "plugin-temp://test",
  "http://localhost:6010",
  "https://localhost:9443",
  "http://127.0.0.1:6010",
  "https://127.0.0.1:9443",
  "http://localhost:6010/",
  "http://localhost:6010/webview/index.html?reload=1#ready",
  "https://127.0.0.1:9443/webview/index.html?reload=1#ready"
];

test("configUxpBridge accepts built-in plugin and loopback origins by default", async () => {
  const environment = installHostEnvironment();

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    const runtime = configUxpBridge({ webview: environment.webview });

    for (const [index, origin] of defaultOrigins.entries()) {
      environment.dispatchReleaseAll(origin);
      await waitFor(() => environment.posted.length === index + 1);

      assert.equal(environment.posted[index].type, "bridge.success");
    }
    for (const origin of [
      "http://localhost:evil",
      "http://localhost:65536",
      "http://[::1]:6010",
      "http://localhost.evil.test:6010/webview",
      "http://localhost@evil.test:6010/webview"
    ]) {
      environment.dispatchReleaseAll(origin);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(environment.posted.length, defaultOrigins.length);

    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configWebviewBridge accepts built-in plugin and loopback origins by default", async () => {
  const environment = installClientEnvironment();

  try {
    const { configWebviewBridge, os } = await import(webviewEntrypoint);
    const runtime = configWebviewBridge({ target: environment.target, timeoutMs: 100 });

    for (const origin of defaultOrigins) {
      const platformPromise = os.platform();
      environment.respondToLatest(origin, "win32");

      assert.equal(await platformPromise, "win32");
    }
    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configUxpBridge appends exact allowed origins without replacing defaults", async () => {
  const environment = installHostEnvironment();

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    const runtime = configUxpBridge({
      webview: environment.webview,
      allowedOrigins: ["https://app.example.com"]
    });

    environment.dispatchReleaseAll("https://app.example.com");
    await waitFor(() => environment.posted.length === 1);
    environment.dispatchReleaseAll("https://app.example.com/webview/index.html?reload=1");
    await waitFor(() => environment.posted.length === 2);
    environment.dispatchReleaseAll("http://localhost:7321");
    await waitFor(() => environment.posted.length === 3);
    environment.dispatchReleaseAll("https://app.example.com.evil.test");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(environment.posted.length, 3);
    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configWebviewBridge appends an exact origin without replacing defaults", async () => {
  const environment = installClientEnvironment();

  try {
    const { configWebviewBridge, os } = await import(webviewEntrypoint);
    const runtime = configWebviewBridge({
      target: environment.target,
      timeoutMs: 100,
      allowedOrigins: ["https://app.example.com"]
    });

    let exactSettled = false;
    const exactPromise = os.platform().then((value) => {
      exactSettled = true;
      return value;
    });
    environment.respondToLatest("https://app.example.com.evil.test", "evil");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(exactSettled, false);
    environment.respondToLatest("https://app.example.com", "exact");
    assert.equal(await exactPromise, "exact");

    const localPromise = os.platform();
    environment.respondToLatest("https://localhost:4555", "local");
    assert.equal(await localPromise, "local");

    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

test("configWebviewBridge appends protocol-wide HTTP and HTTPS origins without replacing defaults", async () => {
  const environment = installClientEnvironment();

  try {
    const { configWebviewBridge, os } = await import(webviewEntrypoint);
    const runtime = configWebviewBridge({
      target: environment.target,
      timeoutMs: 100,
      allowedOrigins: ["http:", "https:"]
    });

    for (const origin of ["http://remote.example.com", "https://remote.example.com"]) {
      const remotePromise = os.platform();
      environment.respondToLatest(origin, "remote");
      assert.equal(await remotePromise, "remote");
    }

    await runtime.destroy();
  } finally {
    environment.restore();
  }
});

function installHostEnvironment() {
  const originalWindow = globalThis.window;
  const originalLog = console.log;
  const listeners = new Set();
  const posted = [];
  const webview = { postMessage: (message) => posted.push(message) };

  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  console.log = () => {};

  return {
    posted,
    webview,
    dispatchReleaseAll(origin) {
      for (const listener of listeners) {
        listener({
          data: { type: "bridge.release-all", operationId: `release-${origin}`, payload: {} },
          origin,
          source: webview
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

function installClientEnvironment() {
  const originalWindow = globalThis.window;
  const originalLog = console.log;
  const listeners = new Set();
  const posted = [];
  const dispatch = (data, origin, source = null) => {
    for (const listener of listeners) {
      listener({ data, origin, source });
    }
  };

  const target = {
    postMessage(message) {
      posted.push(message);
      if (message.type === "bridge.release-all") {
        queueMicrotask(() => {
          dispatch(
            { type: "bridge.success", operationId: message.operationId, payload: undefined },
            "plugin://test",
            target
          );
        });
      }
    }
  };

  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  console.log = () => {};

  return {
    target,
    respondToLatest(origin, payload) {
      const request = posted.findLast((message) => message.type === "bridge.call");
      assert.ok(request, "Expected a bridge.call request.");
      dispatch({ type: "bridge.success", operationId: request.operationId, payload }, origin);
    },
    restore() {
      console.log = originalLog;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for bridge message.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
