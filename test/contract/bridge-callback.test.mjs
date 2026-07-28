import assert from "node:assert/strict";
import { test } from "node:test";

const clientModule = "../../dist/webview/rpc-client.js";
const hostModule = "../../dist/uxp/rpc-host.js";
const registryModule = "../../dist/uxp/module-registry.js";
const protocolModule = "../../dist/shared/protocol.js";
const runtimeModule = "../../dist/webview/runtime.js";

const capabilities = {
  fs: true,
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

test("callback references are stable and generic callback values reject non-transport data", async () => {
  const bus = installMessageBus();
  const { RpcClient } = await import(clientModule);
  const { assertBridgeTransportValue, isBridgeCallbackReference } = await import(protocolModule);
  const client = new RpcClient({ target: bus.clientTarget, timeoutMs: 20 });
  try {
    const callback = () => undefined;
    const first = client.retainCallback(callback);
    const second = client.retainCallback(callback);
    assert.deepEqual(first, second);
    assert.equal(isBridgeCallbackReference(first), true);
    assert.throws(() => assertBridgeTransportValue({ callback }), /not transport-safe/);
    assert.throws(() => {
      const cyclic = {};
      cyclic.self = cyclic;
      assertBridgeTransportValue(cyclic);
    }, /must not contain cycles/);
    client.releaseCallback(first);
    client.releaseCallback(second);
  } finally {
    await client.destroy().catch(() => {});
    bus.restore();
  }
});

test("WebView ignores callback messages from untrusted origins and sources", async () => {
  const bus = installMessageBus();
  const { RpcClient } = await import(clientModule);
  const client = new RpcClient({ target: bus.clientTarget, timeoutMs: 20 });
  let calls = 0;
  try {
    const callback = client.retainCallback(() => {
      calls += 1;
    });
    const invoke = {
      type: "bridge.callback.invoke",
      operationId: "forged-invoke",
      callbackId: callback.callbackId,
      args: [],
      mode: "listener"
    };
    bus.dispatchToClient(invoke, null, "https://evil.example");
    bus.dispatchToClient(invoke, {}, "plugin://test");
    await delay(0);
    assert.equal(calls, 0);

    bus.dispatchToClient(invoke, bus.clientTarget, "com.uxpwebviewbridge.test");
    await waitFor(() => calls === 1);

    bus.dispatchToClient(invoke, null, "plugin://test");
    await waitFor(() => calls === 2);
  } finally {
    await client.destroy().catch(() => {});
    bus.restore();
  }
});

test("modal callback supports a nested call carrying the single active session id", async () => {
  const seen = [];
  const bridge = await createBridge({
    async dispatch(method, args, context) {
      seen.push({ method, modalSessionId: context.modalSessionId, active: context.callbacks.activeModalSessionId });
      if (method === "outer") {
        const session = context.callbacks.openModalSession(context.operationId);
        try {
          return await session.invoke(args[0], [3]);
        } finally {
          await session.close();
        }
      }
      if (method === "nested") {
        assert.equal(context.modalSessionId, context.callbacks.activeModalSessionId);
        return args[0] * 2;
      }
      throw new Error(`Unexpected method: ${method}`);
    }
  });
  try {
    const callback = bridge.client.retainCallback(async (value) => {
      assert.ok(bridge.client.activeModalSessionId);
      return (await bridge.client.call("test/module", "nested", [value])) + 1;
    });
    assert.equal(await bridge.client.call("test/module", "outer", [callback]), 7);
    assert.equal(seen[0].modalSessionId, undefined);
    assert.ok(seen[1].modalSessionId);
    assert.equal(seen[1].modalSessionId, seen[1].active);
    assert.equal(bridge.client.activeModalSessionId, undefined);
  } finally {
    await bridge.destroy();
  }
});

test("callback errors preserve callback and parent operation metadata", async () => {
  const bridge = await createBridge({
    async dispatch(_method, args, context) {
      return context.callbacks.invoke(args[0], [], { parentOperationId: context.operationId });
    }
  });
  try {
    const callback = bridge.client.retainCallback(() => {
      const error = new Error("callback exploded");
      error.code = "E_CALLBACK";
      throw error;
    });
    await assert.rejects(
      bridge.client.call("test/module", "invoke", [callback]),
      (error) => {
        assert.equal(error.name, "BridgeRemoteError");
        assert.equal(error.remoteMessage, "callback exploded");
        assert.equal(error.callbackId, callback.callbackId);
        assert.equal(typeof error.parentOperationId, "string");
        return true;
      }
    );
  } finally {
    await bridge.destroy();
  }
});

test("callback timeout is enforced and zero disables it", async () => {
  const timed = await createBridge(
    {
      dispatch(_method, args, context) {
        return context.callbacks.invoke(args[0]);
      }
    },
    { callbackTimeoutMs: 10 }
  );
  try {
    const callback = timed.client.retainCallback(() => new Promise(() => {}));
    await assert.rejects(
      timed.client.call("test/module", "invoke", [callback]),
      (error) => error.code === "ERR_BRIDGE_CALLBACK_TIMEOUT" && error.callbackId === callback.callbackId
    );
  } finally {
    await timed.destroy();
  }

  const untimed = await createBridge(
    {
      dispatch(_method, args, context) {
        return context.callbacks.invoke(args[0]);
      }
    },
    { callbackTimeoutMs: 0 }
  );
  try {
    const callback = untimed.client.retainCallback(async () => {
      await delay(20);
      return "late-ok";
    });
    assert.equal(await untimed.client.call("test/module", "invoke", [callback]), "late-ok");
  } finally {
    await untimed.destroy();
  }
});

test("listener callbacks are FIFO and callback failures are isolated through onUnhandledError", async () => {
  let cleanupCount = 0;
  const unhandled = [];
  const bridge = await createBridge(
    {
      dispatch(_method, args, context) {
        const reference = args[0];
        context.callbacks.registerSubscription("sub-fifo", () => {
          cleanupCount += 1;
        });
        return Promise.all(
          [1, 2, 3].map((value) =>
            context.callbacks.invoke(reference, [value], {
              mode: "listener",
              subscriptionId: "sub-fifo",
              parentOperationId: context.operationId
            })
          )
        );
      }
    },
    { onUnhandledError: (error) => unhandled.push(error) }
  );
  const order = [];
  try {
    const callback = bridge.client.retainCallback(async (value) => {
      order.push(value);
      if (value === 2) throw new Error("listener failed");
      await delay(2);
    });
    await bridge.client.call("test/module", "listen", [callback]);
    await waitFor(() => unhandled.length === 1);
    assert.deepEqual(order, [1, 2, 3]);
    assert.equal(unhandled[0].remoteMessage, "listener failed");
    assert.equal(unhandled[0].callbackId, callback.callbackId);
  } finally {
    await bridge.destroy();
  }
  assert.equal(cleanupCount, 1);
});

test("listener queue overflow unregisters the subscription and reports a BridgeRemoteError", async () => {
  let cleanupCount = 0;
  const unhandled = [];
  const bridge = await createBridge(
    {
      dispatch(_method, args, context) {
        const reference = args[0];
        context.callbacks.registerSubscription("sub-overflow", () => {
          cleanupCount += 1;
        });
        for (let index = 0; index < 257; index += 1) {
          void context.callbacks.invoke(reference, [index], {
            mode: "listener",
            subscriptionId: "sub-overflow"
          });
        }
        return "queued";
      }
    },
    { onUnhandledError: (error) => unhandled.push(error), callbackTimeoutMs: 0 }
  );
  try {
    const callback = bridge.client.retainCallback(() => new Promise(() => {}));
    assert.equal(await bridge.client.call("test/module", "overflow", [callback]), "queued");
    await waitFor(() => unhandled.some((error) => error.code === "ERR_BRIDGE_CALLBACK_BACKPRESSURE"));
    assert.equal(cleanupCount, 1);
    const overflow = unhandled.find((error) => error.code === "ERR_BRIDGE_CALLBACK_BACKPRESSURE");
    assert.equal(overflow.name, "BridgeRemoteError");
    assert.equal(overflow.callbackId, callback.callbackId);
  } finally {
    await bridge.destroy();
  }
});

test("WebView destroy awaits release-all subscription cleanup and UXP destroy is idempotent", async () => {
  let finishCleanup;
  let cleanupFinished = false;
  const cleanupGate = new Promise((resolve) => {
    finishCleanup = resolve;
  });
  const bridge = await createBridge({
    dispatch(_method, _args, context) {
      context.callbacks.registerSubscription("sub-destroy", async () => {
        await cleanupGate;
        cleanupFinished = true;
      });
      return undefined;
    }
  });
  await bridge.client.call("test/module", "register", []);
  const destroying = bridge.client.destroy();
  await delay(5);
  assert.equal(cleanupFinished, false);
  finishCleanup();
  await destroying;
  assert.equal(cleanupFinished, true);
  await assert.rejects(bridge.client.call("test/module", "after-destroy", []), /destroyed/);
  await Promise.all([bridge.host.destroy(), bridge.host.destroy()]);
  bridge.bus.restore();
});

test("WebView destroy cancels local calls and waits for aborted Host work to settle", async () => {
  let finishCleanup;
  let dispatchStarted = false;
  let cleanupFinished = false;
  const cleanupGate = new Promise((resolve) => {
    finishCleanup = resolve;
  });
  const bridge = await createBridge({
    async dispatch(_method, _args, context) {
      dispatchStarted = true;
      await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
      await cleanupGate;
      cleanupFinished = true;
    }
  });
  const pending = bridge.client.call("test/module", "slow", []);
  await waitFor(() => dispatchStarted);
  let destroySettled = false;
  const destroying = bridge.client.destroy().then(() => {
    destroySettled = true;
  });
  await assert.rejects(pending, /cancelled/);
  await delay(5);
  assert.equal(destroySettled, false);
  assert.equal(cleanupFinished, false);
  finishCleanup();
  await destroying;
  assert.equal(cleanupFinished, true);
  await bridge.host.destroy();
  bridge.bus.restore();
});

test("release-all waits for every cleanup attempt before reporting a cleanup failure", async () => {
  let finishSecondCleanup;
  let secondCleanupFinished = false;
  const secondCleanupGate = new Promise((resolve) => { finishSecondCleanup = resolve; });
  const bridge = await createBridge({
    dispatch(_method, _args, context) {
      context.callbacks.registerSubscription("sub-fails", () => {
        throw new Error("first cleanup failed");
      });
      context.callbacks.registerSubscription("sub-waits", async () => {
        await secondCleanupGate;
        secondCleanupFinished = true;
      });
    }
  });
  await bridge.client.call("test/module", "register-failing-cleanups", []);
  let destroySettled = false;
  const destroying = bridge.client.destroy().finally(() => { destroySettled = true; });
  await delay(5);
  assert.equal(destroySettled, false);
  assert.equal(secondCleanupFinished, false);
  finishSecondCleanup();
  await assert.rejects(destroying, /first cleanup failed/);
  assert.equal(secondCleanupFinished, true);
  await bridge.host.destroy().catch(() => {});
  bridge.bus.restore();
});

test("configWebviewBridge requires awaited teardown before reconfiguration", async () => {
  const originalWindow = globalThis.window;
  const listeners = new Set();
  globalThis.window = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  const target = {
    postMessage(message) {
      if (message.type !== "bridge.release-all") return;
      queueMicrotask(() => {
        for (const listener of [...listeners]) {
          listener({
            data: { type: "bridge.success", operationId: message.operationId, payload: undefined },
            origin: "plugin://test",
            source: null
          });
        }
      });
    }
  };
  try {
    const { configWebviewBridge } = await import(runtimeModule);
    const first = configWebviewBridge({ target });
    assert.throws(
      () => configWebviewBridge({ target }),
      /already configured.*destroy\(\)/i
    );
    await first.destroy();
    const second = configWebviewBridge({ target });
    await second.destroy();
  } finally {
    listeners.clear();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

async function createBridge(adapter, options = {}) {
  const bus = installMessageBus();
  const [{ RpcClient }, { RpcHost }, { createUxpModuleRegistry }] = await Promise.all([
    import(clientModule),
    import(hostModule),
    import(registryModule)
  ]);
  const registry = createUxpModuleRegistry(capabilities, [{ moduleId: "test/module", ...adapter }]);
  const host = new RpcHost({
    webview: bus.webview,
    allowedOrigins: ["plugin:"],
    ...(options.callbackTimeoutMs === undefined ? {} : { callbackTimeoutMs: options.callbackTimeoutMs }),
    dispatchCall: (payload, dispatchOptions) =>
      registry.dispatch(payload, {
        signal: dispatchOptions.signal,
        operationId: dispatchOptions.operationId,
        callbacks: dispatchOptions.callbacks,
        ...(dispatchOptions.modalSessionId === undefined
          ? {}
          : { modalSessionId: dispatchOptions.modalSessionId })
      })
  });
  const client = new RpcClient({
    target: bus.clientTarget,
    timeoutMs: 500,
    ...(options.onUnhandledError === undefined ? {} : { onUnhandledError: options.onUnhandledError })
  });
  return {
    bus,
    client,
    host,
    async destroy() {
      await client.destroy();
      await host.destroy();
      bus.restore();
    }
  };
}

function installMessageBus() {
  const originalWindow = globalThis.window;
  const listeners = new Set();
  const fakeWindow = {
    addEventListener(type, listener) {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") listeners.delete(listener);
    }
  };
  globalThis.window = fakeWindow;
  let webview;
  const dispatch = (data, source, origin = "plugin://test") => {
    queueMicrotask(() => {
      for (const listener of [...listeners]) {
        listener({ data, origin, source });
      }
    });
  };
  webview = { postMessage: (message) => dispatch(message, null) };
  const clientTarget = { postMessage: (message) => dispatch(message, webview) };
  return {
    webview,
    clientTarget,
    dispatchToClient: dispatch,
    restore() {
      listeners.clear();
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition.");
    await delay(2);
  }
}
