import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const capabilitiesModule = "../../dist/shared/capabilities.js";
const registryModule = "../../dist/uxp/module-registry.js";
const uxpEntrypoint = "../../dist/uxp/index.js";

test("bridge capability normalization expands all into a frozen catalog-ordered leaf snapshot", async () => {
  const { BRIDGE_CAPABILITY_NAMES, normalizeBridgeCapabilities } = await import(capabilitiesModule);
  const expected = [
    "clipboard",
    "crypto",
    "fetch",
    "fs",
    "localStorage",
    "os",
    "path",
    "sessionStorage",
    "photoshop.dom",
    "photoshop.core",
    "photoshop.imaging",
    "photoshop.batchPlay",
    "uxp.host",
    "uxp.versions",
    "uxp.shell",
    "uxp.userInfo",
    "uxp.pluginManager",
    "uxp.storage.secureStorage",
    "uxp.storage.localFileSystem",
    "uxp.xmp"
  ];

  assert.deepEqual(BRIDGE_CAPABILITY_NAMES, expected);
  const snapshot = normalizeBridgeCapabilities("all");
  assert.deepEqual(snapshot, expected);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("bridge capability normalization expands groups, deduplicates overlap, and preserves catalog order", async () => {
  const { normalizeBridgeCapabilities } = await import(capabilitiesModule);

  assert.deepEqual(normalizeBridgeCapabilities(["photoshop.all"]), [
    "photoshop.dom",
    "photoshop.core",
    "photoshop.imaging",
    "photoshop.batchPlay"
  ]);
  assert.deepEqual(normalizeBridgeCapabilities(["uxp.all"]), [
    "uxp.host",
    "uxp.versions",
    "uxp.shell",
    "uxp.userInfo",
    "uxp.pluginManager",
    "uxp.storage.secureStorage",
    "uxp.storage.localFileSystem",
    "uxp.xmp"
  ]);
  assert.deepEqual(normalizeBridgeCapabilities(["uxp.storage.all"]), [
    "uxp.storage.secureStorage",
    "uxp.storage.localFileSystem"
  ]);
  assert.deepEqual(
    normalizeBridgeCapabilities([
      "uxp.storage.localFileSystem",
      "photoshop.all",
      "uxp.storage.all",
      "uxp.shell",
      "photoshop.core"
    ]),
    [
      "photoshop.dom",
      "photoshop.core",
      "photoshop.imaging",
      "photoshop.batchPlay",
      "uxp.shell",
      "uxp.storage.secureStorage",
      "uxp.storage.localFileSystem"
    ]
  );
});

test("bridge capability normalization defaults to deny and snapshots caller input", async () => {
  const { normalizeBridgeCapabilities } = await import(capabilitiesModule);
  const input = ["fs"];
  const snapshot = normalizeBridgeCapabilities(input);
  input.push("os");

  assert.deepEqual(normalizeBridgeCapabilities(), []);
  assert.deepEqual(normalizeBridgeCapabilities([]), []);
  assert.deepEqual(snapshot, ["fs"]);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("bridge capability normalization rejects every unsupported runtime form", async () => {
  const { normalizeBridgeCapabilities } = await import(capabilitiesModule);
  const invalid = [
    null,
    true,
    1,
    {},
    { fs: true },
    ["all"],
    ["uxp.*"],
    ["uxp"],
    ["FS"],
    ["!fs"],
    [false],
    [null]
  ];

  for (const value of invalid) {
    assert.throws(() => normalizeBridgeCapabilities(value), TypeError);
  }
});

test("configUxpBridge defaults to denying a representative call from every leaf", async () => {
  const environment = installHostEnvironment();
  let runtime;

  try {
    const { configUxpBridge } = await import(uxpEntrypoint);
    runtime = configUxpBridge({ webview: environment.webview });
    await environment.establish();
    const calls = [
      ["uxp-api/global-members/clipboard", "readText", "clipboard"],
      ["uxp-api/global-members/crypto", "randomUUID", "crypto"],
      ["uxp-api/modules/fetch", "fetch", "fetch"],
      ["uxp-api/modules/fs", "readFile", "fs"],
      ["uxp-api/global-members/local-storage", "getItem", "localStorage"],
      ["uxp-api/modules/os", "platform", "os"],
      ["uxp-api/global-members/path", "normalize", "path"],
      ["uxp-api/global-members/session-storage", "getItem", "sessionStorage"],
      ["photoshop-api/modules/photoshop", "app.documents", "photoshop.dom"],
      ["photoshop-api/modules/core", "core.apiVersion", "photoshop.core"],
      ["photoshop-api/modules/imaging", "imaging.getPixels", "photoshop.imaging"],
      ["photoshop-api/modules/photoshop", "action.batchPlay", "photoshop.batchPlay"],
      ["uxp-api/modules/uxp", "host.name", "uxp.host"],
      ["uxp-api/modules/uxp", "versions.uxp", "uxp.versions"],
      ["uxp-api/modules/uxp", "shell.openPath", "uxp.shell"],
      ["uxp-api/modules/uxp", "userInfo.userId", "uxp.userInfo"],
      ["uxp-api/modules/uxp", "pluginManager.plugins", "uxp.pluginManager"],
      ["uxp-api/modules/uxp", "storage.secureStorage.length", "uxp.storage.secureStorage"],
      ["uxp-api/modules/uxp", "storage.localFileSystem.getDataFolder", "uxp.storage.localFileSystem"],
      ["uxp-api/modules/uxp", "xmp.meta.create", "uxp.xmp"]
    ];

    let expectedResponses = 0;
    for (const [module, method, capability] of calls) {
      expectedResponses += 1;
      const args = expectedResponses === 1
        ? ["plugin-data:/private", "https://secret.example", "storage-key", { descriptor: "secret" }]
        : [];
      environment.dispatchCall(module, method, args);
      await waitFor(() => environment.posted.length === expectedResponses);
      const response = environment.posted.at(-1);
      assert.equal(response.type, "bridge.error");
      assert.equal(response.operationId, `capability-${expectedResponses}`);
      assert.equal(response.error.remoteName, "BridgeCapabilityError");
      assert.equal(response.error.code, "ERR_BRIDGE_CAPABILITY_DISABLED");
      assert.equal(response.error.capability, capability);
      assert.equal(response.error.module, module);
      assert.equal(response.error.method, method);
      if (args.length > 0) {
        const serialized = JSON.stringify(response);
        for (const value of ["plugin-data:/private", "https://secret.example", "storage-key", "secret"]) {
          assert.equal(serialized.includes(value), false);
        }
      }
    }
  } finally {
    await runtime?.destroy();
    environment.restore();
  }
});

test("Photoshop DOM, Core, Imaging, and batchPlay leaves authorize independently", async () => {
  const [
    { createUxpModuleRegistry },
    { coreModuleAdapter },
    { imagingModuleAdapter },
    { photoshopModuleAdapter }
  ] = await Promise.all([
    import(registryModule),
    import("../../dist/uxp/photoshop-api/modules/core/index.js"),
    import("../../dist/uxp/photoshop-api/modules/imaging/index.js"),
    import("../../dist/uxp/photoshop-api/modules/photoshop/index.js")
  ]);
  const cases = [
    ["photoshop.dom", photoshopModuleAdapter, "app.documents"],
    ["photoshop.core", coreModuleAdapter, "core.apiVersion"],
    ["photoshop.imaging", imagingModuleAdapter, "imaging.getPixels"],
    ["photoshop.batchPlay", photoshopModuleAdapter, "action.batchPlay"]
  ];

  for (const [leaf, adapter, method] of cases) {
    const stub = { ...adapter, dispatch: () => leaf };
    const allowed = createUxpModuleRegistry(new Set([leaf]), [stub]);
    assert.equal(allowed.dispatch({ module: adapter.moduleId, method, args: [] }), leaf);

    const denied = createUxpModuleRegistry(new Set(), [stub]);
    assert.throws(
      () => denied.dispatch({ module: adapter.moduleId, method, args: [] }),
      new RegExp(`Bridge capability ${leaf.replaceAll(".", "\\.")} denied operation`)
    );
  }
});

test("Photoshop classifier maps only the three public batchPlay methods to the batchPlay leaf", async () => {
  const [{ PHOTOSHOP_METHOD_NAMES }, { photoshopModuleAdapter }] = await Promise.all([
    import("../../dist/shared/photoshop-api/photoshop-protocol.js"),
    import("../../dist/uxp/photoshop-api/modules/photoshop/index.js")
  ]);
  const batchPlayMethods = new Set(["app.batchPlay", "action.batchPlay", "action.batchPlaySync"]);

  for (const method of PHOTOSHOP_METHOD_NAMES) {
    assert.equal(
      photoshopModuleAdapter.resolveCapability(method),
      batchPlayMethods.has(method) ? "photoshop.batchPlay" : "photoshop.dom",
      method
    );
  }
});

test("UXP classifier assigns every authoritative method to exactly one namespaced leaf", async () => {
  const [{ UXP_METHOD_NAMES }, { uxpModuleAdapter }] = await Promise.all([
    import("../../dist/shared/uxp-api/uxp-protocol.js"),
    import("../../dist/uxp/uxp-api/modules/uxp/index.js")
  ]);

  for (const method of UXP_METHOD_NAMES) {
    assert.equal(uxpModuleAdapter.resolveCapability(method), expectedUxpLeaf(method), method);
  }
});

test("fixed adapters classify every authoritative method without dispatching native code", async () => {
  const [
    clipboardProtocol,
    cryptoProtocol,
    fetchProtocol,
    fsProtocol,
    osProtocol,
    pathProtocol,
    storageProtocol,
    coreProtocol,
    imagingProtocol,
    { clipboardModuleAdapter },
    { cryptoModuleAdapter },
    { fetchModuleAdapter },
    { fsModuleAdapter },
    { osModuleAdapter },
    { pathModuleAdapter },
    { localStorageModuleAdapter },
    { sessionStorageModuleAdapter },
    { coreModuleAdapter },
    { imagingModuleAdapter }
  ] = await Promise.all([
    import("../../dist/shared/uxp-api/clipboard-protocol.js"),
    import("../../dist/shared/uxp-api/crypto-protocol.js"),
    import("../../dist/shared/uxp-api/fetch-protocol.js"),
    import("../../dist/shared/uxp-api/fs-protocol.js"),
    import("../../dist/shared/uxp-api/os-protocol.js"),
    import("../../dist/shared/uxp-api/path-protocol.js"),
    import("../../dist/shared/uxp-api/storage-protocol.js"),
    import("../../dist/shared/photoshop-api/core-protocol.js"),
    import("../../dist/shared/photoshop-api/imaging-protocol.js"),
    import("../../dist/uxp/uxp-api/global-members/clipboard/host.js"),
    import("../../dist/uxp/uxp-api/global-members/crypto/host.js"),
    import("../../dist/uxp/uxp-api/modules/fetch/host.js"),
    import("../../dist/uxp/uxp-api/modules/fs/host.js"),
    import("../../dist/uxp/uxp-api/modules/os/host.js"),
    import("../../dist/uxp/uxp-api/global-members/path/host.js"),
    import("../../dist/uxp/uxp-api/global-members/local-storage/host.js"),
    import("../../dist/uxp/uxp-api/global-members/session-storage/host.js"),
    import("../../dist/uxp/photoshop-api/modules/core/host.js"),
    import("../../dist/uxp/photoshop-api/modules/imaging/host.js")
  ]);
  const pathMethods = pathProtocol.PATH_FLAVOR_NAMES.flatMap((flavor) =>
    pathProtocol.PATH_FLAVOR_METHOD_NAMES.map((method) =>
      flavor === "path" ? method : `${flavor}.${method}`
    )
  );
  const cases = [
    [clipboardModuleAdapter, clipboardProtocol.CLIPBOARD_METHOD_NAMES, "clipboard"],
    [cryptoModuleAdapter, cryptoProtocol.CRYPTO_METHOD_NAMES, "crypto"],
    [fetchModuleAdapter, fetchProtocol.FETCH_METHOD_NAMES, "fetch"],
    [fsModuleAdapter, fsProtocol.FS_METHOD_NAMES, "fs"],
    [osModuleAdapter, osProtocol.OS_METHOD_NAMES, "os"],
    [pathModuleAdapter, pathMethods, "path"],
    [localStorageModuleAdapter, storageProtocol.STORAGE_METHOD_NAMES, "localStorage"],
    [sessionStorageModuleAdapter, storageProtocol.STORAGE_METHOD_NAMES, "sessionStorage"],
    [
      coreModuleAdapter,
      [...coreProtocol.PHOTOSHOP_CORE_METHOD_NAMES, ...coreProtocol.PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES],
      "photoshop.core"
    ],
    [imagingModuleAdapter, imagingProtocol.PHOTOSHOP_IMAGING_METHOD_NAMES, "photoshop.imaging"]
  ];

  for (const [adapter, methods, leaf] of cases) {
    for (const method of methods) {
      assert.equal(adapter.resolveCapability(method), leaf, `${adapter.moduleId}:${method}`);
    }
  }
});

test("each leaf authorizes its representative call and rejects an adjacent leaf", async () => {
  const [
    { createUxpModuleRegistry },
    { clipboardModuleAdapter },
    { cryptoModuleAdapter },
    { fetchModuleAdapter },
    { fsModuleAdapter },
    { localStorageModuleAdapter },
    { osModuleAdapter },
    { pathModuleAdapter },
    { sessionStorageModuleAdapter },
    { coreModuleAdapter },
    { imagingModuleAdapter },
    { photoshopModuleAdapter },
    { uxpModuleAdapter }
  ] = await Promise.all([
    import(registryModule),
    import("../../dist/uxp/uxp-api/global-members/clipboard/host.js"),
    import("../../dist/uxp/uxp-api/global-members/crypto/host.js"),
    import("../../dist/uxp/uxp-api/modules/fetch/host.js"),
    import("../../dist/uxp/uxp-api/modules/fs/host.js"),
    import("../../dist/uxp/uxp-api/global-members/local-storage/host.js"),
    import("../../dist/uxp/uxp-api/modules/os/host.js"),
    import("../../dist/uxp/uxp-api/global-members/path/host.js"),
    import("../../dist/uxp/uxp-api/global-members/session-storage/host.js"),
    import("../../dist/uxp/photoshop-api/modules/core/host.js"),
    import("../../dist/uxp/photoshop-api/modules/imaging/host.js"),
    import("../../dist/uxp/photoshop-api/modules/photoshop/host.js"),
    import("../../dist/uxp/uxp-api/modules/uxp/host.js")
  ]);
  const adapters = [
    clipboardModuleAdapter,
    cryptoModuleAdapter,
    fetchModuleAdapter,
    fsModuleAdapter,
    localStorageModuleAdapter,
    osModuleAdapter,
    pathModuleAdapter,
    sessionStorageModuleAdapter,
    coreModuleAdapter,
    imagingModuleAdapter,
    photoshopModuleAdapter,
    uxpModuleAdapter
  ].map((adapter) => ({ ...adapter, dispatch: () => adapter.moduleId }));
  const representative = [
    ["clipboard", clipboardModuleAdapter.moduleId, "readText"],
    ["crypto", cryptoModuleAdapter.moduleId, "randomUUID"],
    ["fetch", fetchModuleAdapter.moduleId, "fetch"],
    ["fs", fsModuleAdapter.moduleId, "readFile"],
    ["localStorage", localStorageModuleAdapter.moduleId, "getItem"],
    ["os", osModuleAdapter.moduleId, "platform"],
    ["path", pathModuleAdapter.moduleId, "normalize"],
    ["sessionStorage", sessionStorageModuleAdapter.moduleId, "getItem"],
    ["photoshop.dom", photoshopModuleAdapter.moduleId, "app.documents"],
    ["photoshop.core", coreModuleAdapter.moduleId, "core.apiVersion"],
    ["photoshop.imaging", imagingModuleAdapter.moduleId, "imaging.getPixels"],
    ["photoshop.batchPlay", photoshopModuleAdapter.moduleId, "action.batchPlay"],
    ["uxp.host", uxpModuleAdapter.moduleId, "host.name"],
    ["uxp.versions", uxpModuleAdapter.moduleId, "versions.uxp"],
    ["uxp.shell", uxpModuleAdapter.moduleId, "shell.openPath"],
    ["uxp.userInfo", uxpModuleAdapter.moduleId, "userInfo.userId"],
    ["uxp.pluginManager", uxpModuleAdapter.moduleId, "pluginManager.plugins"],
    ["uxp.storage.secureStorage", uxpModuleAdapter.moduleId, "storage.secureStorage.length"],
    ["uxp.storage.localFileSystem", uxpModuleAdapter.moduleId, "storage.localFileSystem.getDataFolder"],
    ["uxp.xmp", uxpModuleAdapter.moduleId, "xmp.meta.create"]
  ];

  for (let index = 0; index < representative.length; index += 1) {
    const [leaf, module, method] = representative[index];
    const adjacent = representative[(index + 1) % representative.length];
    const registry = createUxpModuleRegistry(new Set([leaf]), adapters);
    assert.equal(registry.dispatch({ module, method, args: [] }), module, leaf);
    assert.throws(
      () => registry.dispatch({ module: adjacent[1], method: adjacent[2], args: [] }),
      (error) => error.code === "ERR_BRIDGE_CAPABILITY_DISABLED" && error.capability === adjacent[0]
    );
  }
});

test("registry denial is structured, precedes dispatch, and never includes request arguments", async () => {
  const [{ BridgeRemoteError }, { createUxpModuleRegistry }] = await Promise.all([
    import("../../dist/shared/errors.js"),
    import(registryModule)
  ]);
  let dispatched = false;
  const adapter = {
    moduleId: "sensitive/module",
    resolveCapability(method) {
      if (method !== "read") throw new Error(`Unsupported sensitive method: ${method}`);
      return "fs";
    },
    dispatch() {
      dispatched = true;
    }
  };
  const registry = createUxpModuleRegistry(new Set(), [adapter]);
  const sentinels = [
    "plugin-data:/private/file.txt",
    "https://secret.example/token",
    "storage-key-secret",
    "photoshop-descriptor-secret",
    "arbitrary-argument-secret"
  ];
  let denial;

  try {
    registry.dispatch(
      { module: adapter.moduleId, method: "read", args: sentinels },
      { operationId: "operation-denied" }
    );
  } catch (error) {
    denial = error;
  }

  assert.ok(denial instanceof BridgeRemoteError);
  assert.equal(denial.code, "ERR_BRIDGE_CAPABILITY_DISABLED");
  assert.equal(denial.remoteName, "BridgeCapabilityError");
  assert.equal(denial.operationId, "operation-denied");
  assert.equal(denial.capability, "fs");
  assert.equal(denial.module, adapter.moduleId);
  assert.equal(denial.method, "read");
  assert.equal(dispatched, false);
  const serialized = JSON.stringify(denial);
  for (const sentinel of sentinels) assert.equal(serialized.includes(sentinel), false);

  assert.throws(
    () => registry.dispatch({ module: adapter.moduleId, method: "missing", args: sentinels }),
    /Unsupported sensitive method: missing/
  );
  assert.throws(
    () => registry.dispatch({ module: "missing/module", method: "read", args: sentinels }),
    (error) => error.code === undefined && /Unsupported bridge module/.test(error.message)
  );
});

test("WebView reconstruction exposes structured capability denial fields", async () => {
  const originalWindow = globalThis.window;
  const listeners = new Set();
  const posted = [];
  const target = { postMessage: (message) => posted.push(message) };
  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };

  try {
    const { RpcClient } = await import("../../dist/webview/rpc-client.js");
    const client = new RpcClient({ target, timeoutMs: 500 });
    const pending = client.call("uxp-api/modules/fs", "readFile", ["private-path"]);
    await waitFor(() => posted.length === 1);
    const request = posted[0];
    dispatchToListeners(listeners, target, {
      type: "bridge.error",
      operationId: request.operationId,
      error: {
        remoteName: "BridgeCapabilityError",
        remoteMessage: `Bridge capability fs denied operation ${request.operationId}.`,
        code: "ERR_BRIDGE_CAPABILITY_DISABLED",
        capability: "fs",
        module: "uxp-api/modules/fs",
        method: "readFile"
      }
    });

    await assert.rejects(pending, (error) => {
      assert.equal(error.name, "BridgeRemoteError");
      assert.equal(error.remoteName, "BridgeCapabilityError");
      assert.equal(error.code, "ERR_BRIDGE_CAPABILITY_DISABLED");
      assert.equal(error.capability, "fs");
      assert.equal(error.module, "uxp-api/modules/fs");
      assert.equal(error.method, "readFile");
      assert.equal(error.operationId, request.operationId);
      return true;
    });

    const destroying = client.destroy();
    await waitFor(() => posted.length === 2);
    dispatchToListeners(listeners, target, {
      type: "bridge.success",
      operationId: posted[1].operationId,
      payload: undefined
    });
    await destroying;
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("real-host fixture explicitly lists its current leaves without permissive groups", async () => {
  const [{ BRIDGE_CAPABILITY_NAMES }, source] = await Promise.all([
    import(capabilitiesModule),
    readFile(new URL("../uxp-plugin/host.js", import.meta.url), "utf8")
  ]);
  const match = source.match(/const capabilities\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(match, "fixture capability allowlist should be readable");
  const configured = JSON.parse(match[1]);

  assert.deepEqual(configured, BRIDGE_CAPABILITY_NAMES.filter((leaf) => leaf !== "fetch"));
  assert.equal(configured.includes("all"), false);
  assert.equal(configured.some((selector) => selector.endsWith(".all")), false);
});

function expectedUxpLeaf(method) {
  if (method.startsWith("host.")) return "uxp.host";
  if (method.startsWith("versions.")) return "uxp.versions";
  if (method.startsWith("shell.")) return "uxp.shell";
  if (method.startsWith("userInfo.")) return "uxp.userInfo";
  if (method.startsWith("pluginManager.") || method.startsWith("plugin.")) {
    return "uxp.pluginManager";
  }
  if (method.startsWith("storage.secureStorage.")) return "uxp.storage.secureStorage";
  if (method.startsWith("storage.")) return "uxp.storage.localFileSystem";
  if (method.startsWith("xmp.")) return "uxp.xmp";
  throw new Error(`Unclassified test method: ${method}`);
}

function installHostEnvironment() {
  const originalWindow = globalThis.window;
  const originalLog = console.log;
  const listeners = new Set();
  const posted = [];
  const webview = { postMessage: (message) => posted.push(message) };
  let operation = 0;
  let bridgeSessionId;

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
    async establish() {
      dispatch({
        type: "bridge.hello",
        protocolVersion: "0.3.0",
        clientVersion: "test",
        clientInstanceId: "capabilities-client"
      });
      await waitFor(() => posted.at(-1)?.type === "bridge.handshake.challenge");
      const challenge = posted.at(-1);
      dispatch({
        type: "bridge.handshake.ack",
        clientInstanceId: "capabilities-client",
        candidateId: challenge.candidateId,
        documentGeneration: challenge.documentGeneration,
        challenge: challenge.challenge
      });
      await waitFor(() => posted.at(-1)?.type === "bridge.ready");
      const ready = posted.at(-1);
      bridgeSessionId = ready.bridgeSessionId;
      dispatch({
        type: "bridge.ready.ack",
        clientInstanceId: "capabilities-client",
        candidateId: ready.candidateId,
        documentGeneration: ready.documentGeneration,
        bridgeSessionId: ready.bridgeSessionId,
        readyNonce: ready.readyNonce
      });
      dispatch({
        type: "bridge.session.confirm",
        bridgeSessionId: ready.bridgeSessionId,
        clientInstanceId: "capabilities-client",
        documentGeneration: ready.documentGeneration
      });
      posted.length = 0;
    },
    dispatchCall(module, method, args = []) {
      operation += 1;
      dispatch({
        type: "bridge.call",
        bridgeSessionId,
        operationId: `capability-${operation}`,
        payload: { module, method, args }
      });
    },
    restore() {
      console.log = originalLog;
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  };

  function dispatch(data) {
    for (const listener of listeners) {
      listener({ data, origin: "plugin://test", source: webview });
    }
  }
}

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for bridge response.");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function dispatchToListeners(listeners, source, data) {
  for (const listener of listeners) {
    listener({ data, origin: "plugin://test", source });
  }
}
