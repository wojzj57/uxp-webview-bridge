import assert from "node:assert/strict";
import { test } from "node:test";

test("filesystem adapter factories isolate equal native descriptor ids", async () => {
  const { createFsModuleAdapter } = await import(
    "../../dist/uxp/uxp-api/modules/fs/index.js"
  );
  const originalRequire = globalThis.require;
  const closeCalls = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "fs");
    return {
      async open() {
        return 42;
      },
      async read(fd, buffer) {
        new Uint8Array(buffer)[0] = fd;
        return { bytesRead: 1, buffer };
      },
      async close(fd) {
        closeCalls.push(fd);
        return 0;
      }
    };
  };

  const ownerA = createFsModuleAdapter();
  const ownerB = createFsModuleAdapter();

  try {
    assert.equal(await ownerA.dispatch("open", ["plugin-temp:/a", "r"]), 42);
    assert.equal(await ownerB.dispatch("open", ["plugin-temp:/b", "r"]), 42);

    await ownerA.destroy();

    assert.deepEqual(
      await ownerB.dispatch("read", [
        42,
        { kind: "bytes", encoding: "array", value: [0] },
        0,
        1,
        0
      ]),
      {
        bytesRead: 1,
        buffer: { kind: "bytes", encoding: "array", value: [42] }
      }
    );
    assert.deepEqual(closeCalls, [42]);
  } finally {
    await ownerB.destroy();
    restoreRequire(originalRequire);
  }
});

test("imaging adapter owner disposes every native image resource on teardown", async () => {
  const { createImagingModuleAdapter } = await import(
    "../../dist/uxp/photoshop-api/modules/imaging/index.js"
  );
  const originalRequire = globalThis.require;
  let disposals = 0;
  const imageData = {
    width: 1,
    height: 1,
    components: 4,
    componentSize: 8,
    colorSpace: "RGB",
    colorProfile: "sRGB",
    hasAlpha: true,
    pixelFormat: "RGBA",
    chunky: true,
    type: "PhotoshopImageData",
    getData: async () => new Uint8Array(4),
    dispose: async () => { disposals += 1; }
  };
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return {
      imaging: { createImageDataFromBuffer: async () => imageData },
      core: { executeAsModal: async (run) => run({}) }
    };
  };

  const owner = createImagingModuleAdapter("bridge-images");
  try {
    await owner.dispatch("imaging.createImageDataFromBuffer", [
      { kind: "bytes", encoding: "array", value: [1, 2, 3, 4] },
      { width: 1, height: 1, components: 4, colorSpace: "RGB" }
    ]);
    await owner.destroy();
    assert.equal(disposals, 1);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("photoshop adapter factories isolate equal native document ids and dispatch contexts", async () => {
  const { createPhotoshopModuleAdapter } = await import(
    "../../dist/uxp/photoshop-api/modules/photoshop/index.js"
  );
  const originalRequire = globalThis.require;
  const document = { id: 7, name: "shared.psd", typename: "Document" };

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return {
      app: { activeDocument: document },
      core: {
        executeAsModal(run) {
          return Promise.resolve(run({}));
        }
      }
    };
  };

  const ownerA = createPhotoshopModuleAdapter("bridge-a");
  const ownerB = createPhotoshopModuleAdapter("bridge-b");
  const callbacks = {
    activeModalSessionId: undefined,
    invoke() { throw new Error("not used"); },
    registerSubscription() {},
    unregisterSubscription() { return Promise.resolve(); },
    openModalSession() { throw new Error("not used"); }
  };

  try {
    const referenceA = ownerA.dispatch("app.activeDocument", [], {
      operationId: "a",
      bridgeSessionId: "bridge-a",
      callbacks
    });
    const referenceB = ownerB.dispatch("app.activeDocument", [], {
      operationId: "b",
      bridgeSessionId: "bridge-b",
      callbacks
    });

    assert.equal(referenceA.bridgeSessionId, "bridge-a");
    assert.equal(referenceB.bridgeSessionId, "bridge-b");
    await ownerA.destroy();
    assert.equal(
      ownerB.dispatch("document.propertyGet", [referenceB, "name"], {
        operationId: "b-read",
        bridgeSessionId: "bridge-b",
        callbacks
      }),
      "shared.psd"
    );
    assert.throws(
      () => ownerB.dispatch("document.propertyGet", [referenceA, "name"], {
        operationId: "cross-owner",
        bridgeSessionId: "bridge-b",
        callbacks
      }),
      (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
    );
  } finally {
    await ownerB.destroy();
    restoreRequire(originalRequire);
  }
});

test("UXP adapter factories isolate persistent-storage handles and owner ids", async () => {
  const { createUxpModuleAdapter } = await import(
    "../../dist/uxp/uxp-api/modules/uxp/index.js"
  );
  const originalRequire = globalThis.require;
  const folder = {
    isFolder: true,
    name: "data",
    url: "plugin-data:/",
    toString() { return this.url; }
  };

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      storage: {
        localFileSystem: {
          getDataFolder() { return Promise.resolve(folder); }
        }
      },
      xmp: {}
    };
  };

  const ownerA = createUxpModuleAdapter("bridge-a");
  const ownerB = createUxpModuleAdapter("bridge-b");
  try {
    const referenceA = await ownerA.dispatch("storage.localFileSystem.getDataFolder", []);
    const referenceB = await ownerB.dispatch("storage.localFileSystem.getDataFolder", []);
    assert.equal(referenceA.bridgeSessionId, "bridge-a");
    assert.equal(referenceB.bridgeSessionId, "bridge-b");

    await ownerA.destroy();
    assert.equal(ownerB.dispatch("storage.entry.toString", [referenceB]), "plugin-data:/");
    assert.throws(
      () => ownerB.dispatch("storage.entry.toString", [referenceA]),
      (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
    );
  } finally {
    await ownerB.destroy();
    restoreRequire(originalRequire);
  }
});

test("adapter owner construction rolls back partial owners in bounded reverse all-attempt order", async () => {
  const { constructAdapterOwners } = await import(
    "../../dist/uxp/adapter-owner-transaction.js"
  );
  const events = [];
  const never = new Promise(() => {});

  await assert.rejects(
    constructAdapterOwners([
      {
        name: "first",
        create: () => ({
          moduleId: "first",
          resolveCapability: () => "os",
          dispatch() {},
          destroy: () => { events.push("first:destroy"); }
        })
      },
      {
        name: "second",
        create: () => ({
          moduleId: "second",
          resolveCapability: () => "os",
          dispatch() {},
          destroy: () => { events.push("second:destroy"); return never; }
        })
      },
      {
        name: "injected-failure",
        create: () => { events.push("failure:create"); throw new Error("factory exploded"); }
      }
    ], { ownerDeadlineMs: 5, totalDeadlineMs: 20 }),
    (error) => {
      assert.equal(error.code, "ERR_BRIDGE_ADAPTER_CONSTRUCTION");
      assert.match(error.cause.message, /factory exploded/);
      assert.deepEqual(error.rollbackFailures, [
        { owner: "second", disposition: "timed-out" }
      ]);
      return true;
    }
  );
  assert.deepEqual(events, ["failure:create", "second:destroy", "first:destroy"]);
});

test("candidate cancellation aborts a hanging factory and rolls back prior owners", async () => {
  const { constructAdapterOwners } = await import(
    "../../dist/uxp/adapter-owner-transaction.js"
  );
  const controller = new AbortController();
  const events = [];
  let receivedSignal;
  const construction = constructAdapterOwners([
    {
      name: "first",
      create: () => ({
        moduleId: "first",
        resolveCapability: () => "os",
        dispatch() {},
        destroy: () => { events.push("first:destroy"); }
      })
    },
    {
      name: "hanging",
      create: (signal) => {
        receivedSignal = signal;
        events.push("hanging:create");
        return new Promise(() => {});
      }
    }
  ], { ownerDeadlineMs: 10, totalDeadlineMs: 50 }, controller.signal);

  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort("candidate-revoked");
  await assert.rejects(
    Promise.race([
      construction,
      new Promise((_, reject) => setTimeout(() => reject(new Error("construction did not cancel")), 100))
    ]),
    (error) => {
      assert.equal(error.code, "ERR_BRIDGE_ADAPTER_CONSTRUCTION");
      assert.equal(error.cause?.code, "ERR_BRIDGE_CANDIDATE_ABORTED");
      return true;
    }
  );
  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(events, ["hanging:create", "first:destroy"]);
});

function restoreRequire(originalRequire) {
  if (originalRequire === undefined) {
    delete globalThis.require;
  } else {
    globalThis.require = originalRequire;
  }
}
