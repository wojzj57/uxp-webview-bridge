import assert from "node:assert/strict";
import test from "node:test";

const photoshopHostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
const imagingHostModule = "../../dist/uxp/photoshop-api/modules/imaging/host.js";

function createDispatchContext(modalSessionId, activeModalSessionId) {
  return {
    capabilities: { photoshop: true, imaging: true, batchPlay: true },
    operationId: "modal-session-contract",
    modalSessionId,
    callbacks: {
      activeModalSessionId,
      invoke() {
        throw new Error("Callback invocation is outside this contract test.");
      },
      registerSubscription() {},
      unregisterSubscription() {
        return Promise.resolve();
      },
      openModalSession() {
        throw new Error("Opening a modal session is outside this contract test.");
      }
    }
  };
}

async function withPhotoshopRequire(stub, run) {
  const originalRequire = globalThis.require;
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return stub;
  };
  try {
    return await run();
  } finally {
    globalThis.require = originalRequire;
  }
}

test("photoshop DOM mutations reuse the active Core modal session", async () => {
  const { photoshopModuleAdapter } = await import(photoshopHostModule);
  const calls = [];
  let modalCalls = 0;
  const stub = {
    action: {
      batchPlaySync(commands, options) {
        calls.push([commands, options]);
        return [{ _obj: "document", documentID: calls.length }];
      }
    },
    core: {
      executeAsModal(fn) {
        modalCalls += 1;
        return Promise.resolve(fn({}));
      }
    }
  };
  const commands = [{ _obj: "make", _target: [{ _ref: "document" }] }];

  await withPhotoshopRequire(stub, async () => {
    const activeContext = createDispatchContext("session-1", "session-1");
    await photoshopModuleAdapter.dispatch("action.batchPlaySync", [commands], activeContext);
    assert.equal(modalCalls, 0, "an active matching session must not nest executeAsModal");

    const mismatchedContext = createDispatchContext("session-2", "session-1");
    await photoshopModuleAdapter.dispatch("action.batchPlaySync", [commands], mismatchedContext);
    await photoshopModuleAdapter.dispatch("action.batchPlaySync", [commands]);
    assert.equal(modalCalls, 2, "mismatched and absent sessions retain the existing modal wrapper");
    assert.equal(calls.length, 3);
  });
});

test("imaging mutations reuse the active Core modal session", async () => {
  const { destroyImagingHandles, imagingModuleAdapter } = await import(imagingHostModule);
  let getPixelsCalls = 0;
  let putPixelsCalls = 0;
  let modalCalls = 0;
  const createNativeImageData = () => ({
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
    async getData() {
      return new Uint8Array([0, 0, 0, 255]);
    },
    dispose() {}
  });
  const stub = {
    imaging: {
      async getPixels() {
        getPixelsCalls += 1;
        return {
          imageData: createNativeImageData(),
          sourceBounds: { left: 0, top: 0, right: 1, bottom: 1 },
          level: 0
        };
      },
      async putPixels() {
        putPixelsCalls += 1;
      }
    },
    core: {
      async executeAsModal(fn) {
        modalCalls += 1;
        return fn({});
      }
    }
  };

  await withPhotoshopRequire(stub, async () => {
    try {
      const activeContext = createDispatchContext("session-1", "session-1");
      const read = await imagingModuleAdapter.dispatch("imaging.getPixels", [{ layerID: 1 }], activeContext);
      const putOptions = { layerID: 1, imageData: read.imageData, replace: true };
      await imagingModuleAdapter.dispatch("imaging.putPixels", [putOptions], activeContext);
      assert.equal(modalCalls, 0, "an active matching session must not nest executeAsModal");

      const mismatchedContext = createDispatchContext("session-2", "session-1");
      await imagingModuleAdapter.dispatch("imaging.putPixels", [putOptions], mismatchedContext);
      await imagingModuleAdapter.dispatch("imaging.putPixels", [putOptions]);
      assert.equal(modalCalls, 2, "mismatched and absent sessions retain the existing modal wrapper");
      assert.equal(getPixelsCalls, 1);
      assert.equal(putPixelsCalls, 3);
    } finally {
      destroyImagingHandles();
    }
  });
});
