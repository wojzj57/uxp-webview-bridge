import assert from "node:assert/strict";
import { test } from "node:test";

const capabilitiesModule = "../../dist/shared/capabilities.js";
const registryModule = "../../dist/uxp/module-registry.js";
const uxpEntrypoint = "../../dist/uxp/index.js";

test("bridge capability defaults enable every public configurable surface", async () => {
  const { DEFAULT_BRIDGE_CAPABILITIES, mergeCapabilities } = await import(capabilitiesModule);
  const expected = {
    fs: true,
    os: true,
    clipboard: true,
    localStorage: true,
    sessionStorage: true,
    fetch: true,
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

  assert.deepEqual(DEFAULT_BRIDGE_CAPABILITIES, expected);
  assert.deepEqual(mergeCapabilities(), expected);
  assert.deepEqual(mergeCapabilities({ fetch: false, imaging: false }), {
    ...expected,
    fetch: false,
    imaging: false
  });
});

test("configUxpBridge can disable clipboard, storage, and forwarded fetch adapters", async () => {
  const environment = installHostEnvironment();
  let runtime;

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    runtime = configUxpBridge({
      webview: environment.webview,
      capabilities: {
        clipboard: false,
        localStorage: false,
        sessionStorage: false,
        fetch: false
      }
    });
    const calls = [
      ["uxp-api/global-members/clipboard", "readText", "clipboard"],
      ["uxp-api/global-members/local-storage", "getItem", "localStorage"],
      ["uxp-api/global-members/session-storage", "getItem", "sessionStorage"],
      ["uxp-api/modules/fetch", "fetch", "fetch"]
    ];

    let expectedResponses = 0;
    for (const [module, method, capability] of calls) {
      expectedResponses += 1;
      environment.dispatchCall(module, method);
      await waitFor(() => environment.posted.length === expectedResponses);
      const response = environment.posted.at(-1);
      assert.equal(response.type, "bridge.error");
      assert.match(response.error.remoteMessage, new RegExp(`${capability} capability is disabled`));
    }
  } finally {
    await runtime?.destroy();
    environment.restore();
  }
});

test("imaging requires both the Photoshop parent capability and the imaging sub-capability", async () => {
  const [{ createUxpModuleRegistry }, { DEFAULT_BRIDGE_CAPABILITIES }, { imagingModuleAdapter }] =
    await Promise.all([
      import(registryModule),
      import(capabilitiesModule),
      import("../../dist/uxp/photoshop-api/modules/imaging/index.js")
    ]);
  const payload = {
    module: "photoshop-api/modules/imaging",
    method: "imaging.getPixels",
    args: [{}]
  };

  const imagingDisabled = createUxpModuleRegistry(
    { ...DEFAULT_BRIDGE_CAPABILITIES, imaging: false },
    [imagingModuleAdapter]
  );
  assert.throws(() => imagingDisabled.dispatch(payload), /imaging capability is disabled/);

  const photoshopDisabled = createUxpModuleRegistry(
    { ...DEFAULT_BRIDGE_CAPABILITIES, photoshop: false, imaging: true },
    [imagingModuleAdapter]
  );
  assert.throws(() => photoshopDisabled.dispatch(payload), /photoshop capability is disabled/);

  const imagingEnabled = createUxpModuleRegistry(DEFAULT_BRIDGE_CAPABILITIES, [imagingModuleAdapter]);
  assert.throws(
    () => imagingEnabled.dispatch({
      module: payload.module,
      method: "imaging.imageData.dispose",
      args: [{}]
    }),
    /requires a PsImageData reference/
  );
});

test("batchPlay capability gates only the three public batchPlay RPC methods", async () => {
  const [{ createUxpModuleRegistry }, { DEFAULT_BRIDGE_CAPABILITIES }, { photoshopModuleAdapter }] =
    await Promise.all([
      import(registryModule),
      import(capabilitiesModule),
      import("../../dist/uxp/photoshop-api/modules/photoshop/index.js")
    ]);
  const registry = createUxpModuleRegistry(
    { ...DEFAULT_BRIDGE_CAPABILITIES, batchPlay: false },
    [photoshopModuleAdapter]
  );
  let required = false;
  const originalRequire = globalThis.require;
  globalThis.require = () => {
    required = true;
    return { app: { documents: [] } };
  };

  try {
    for (const method of ["app.batchPlay", "action.batchPlay", "action.batchPlaySync"]) {
      assert.throws(
        () => registry.dispatch({ module: "photoshop-api/modules/photoshop", method, args: [] }),
        /batchPlay capability is disabled/
      );
    }
    assert.equal(required, false, "disabled batchPlay must reject before requiring Photoshop");
    assert.deepEqual(
      registry.dispatch({
        module: "photoshop-api/modules/photoshop",
        method: "app.documents",
        args: []
      }),
      []
    );
    assert.equal(required, true, "non-batchPlay Photoshop methods remain controlled by photoshop");
  } finally {
    if (originalRequire === undefined) delete globalThis.require;
    else globalThis.require = originalRequire;
  }
});

function installHostEnvironment() {
  const originalWindow = globalThis.window;
  const originalLog = console.log;
  const listeners = new Set();
  const posted = [];
  const webview = { postMessage: (message) => posted.push(message) };
  let operation = 0;

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
    dispatchCall(module, method) {
      operation += 1;
      for (const listener of listeners) {
        listener({
          data: {
            type: "bridge.call",
            operationId: `capability-${operation}`,
            payload: { module, method, args: [] }
          },
          origin: "plugin://test",
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

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for bridge response.");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
