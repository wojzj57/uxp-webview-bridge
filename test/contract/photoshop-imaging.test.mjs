import assert from "node:assert/strict";
import { test } from "node:test";

// Contract tests run against the built dist. The imaging module has two seams: a WebView client that
// turns pixel-read results into PsImageData proxies (and swaps proxies back to references on writes),
// and a UXP host adapter that registers native imageData handles and envelopes bytes via the shared
// binary transport (RFC-0010 Part 2 / ADR 0011). Both are exercised here without a real Photoshop
// host: the client is driven by a recording rpc, the host by a stubbed `require("photoshop")`.
const imagingModule = "../../dist/webview/photoshop-api/modules/imaging/imaging.js";
const imagingProtocolModule = "../../dist/shared/photoshop-api/imaging-protocol.js";
const remoteProtocolModule = "../../dist/shared/uxp-api/remote-protocol.js";
const valueObjectsModule = "../../dist/shared/photoshop-api/value-objects.js";
const binaryTransportModule = "../../dist/shared/uxp-api/binary-transport.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/imaging/host.js";

const IMAGING_MODULE_ID = "photoshop-api/modules/imaging";
const PS_IMAGE_DATA_TYPE = "PsImageData";

/** A recording rpc that returns queued results in order. */
function createRecordingRpc(results) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    call(module, method, args) {
      calls.push({ module, method, args });
      return Promise.resolve(queue.length > 0 ? queue.shift() : undefined);
    }
  };
}

/** Build a well-formed host-side pixel-read transport for the client to decode. */
async function makeImageDataTransport(overrides = {}) {
  const { serializeValue } = await import(valueObjectsModule);
  const { IMAGE_DATA_METADATA_VALUE_KIND, PS_IMAGE_DATA_TYPE: TYPE } = await import(imagingProtocolModule);
  const { REMOTE_REFERENCE_KIND } = await import(remoteProtocolModule);
  const metadataSource = {
    width: 2,
    height: 1,
    components: 4,
    componentSize: 8,
    colorSpace: "RGB",
    colorProfile: "sRGB",
    hasAlpha: true,
    pixelFormat: "RGBA",
    chunky: true,
    type: "PhotoshopImageData",
    ...overrides
  };
  return {
    imageData: { kind: REMOTE_REFERENCE_KIND, type: TYPE, id: "PsImageData:1" },
    metadata: serializeValue(IMAGE_DATA_METADATA_VALUE_KIND, metadataSource)
  };
}

function withPhotoshopRequire(stub, run) {
  const originalRequire = globalThis.require;
  globalThis.require = (moduleName) => {
    if (moduleName !== "photoshop") {
      throw new Error(`Unexpected require: ${moduleName}`);
    }
    return stub;
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (originalRequire === undefined) {
        delete globalThis.require;
      } else {
        globalThis.require = originalRequire;
      }
    });
}

// ---------------------------------------------------------------------------- protocol

test("imaging method names are accepted and PsImageDataMetadata value kind is registered", async () => {
  const { isPhotoshopImagingMethodName, assertPhotoshopImagingMethodName, IMAGE_DATA_METADATA_VALUE_KIND } =
    await import(imagingProtocolModule);
  const { registeredValueKinds } = await import(valueObjectsModule);

  for (const name of [
    "imaging.getPixels",
    "imaging.putPixels",
    "imaging.getLayerMask",
    "imaging.putLayerMask",
    "imaging.getSelection",
    "imaging.putSelection",
    "imaging.createImageDataFromBuffer",
    "imaging.encodeImageData",
    "imaging.imageData.getData",
    "imaging.imageData.dispose"
  ]) {
    assert.equal(isPhotoshopImagingMethodName(name), true, `${name} must be a known imaging method.`);
    assert.doesNotThrow(() => assertPhotoshopImagingMethodName(name));
  }
  assert.equal(isPhotoshopImagingMethodName("imaging.bogus"), false);
  assert.ok(
    registeredValueKinds().includes(IMAGE_DATA_METADATA_VALUE_KIND),
    "the imaging metadata value kind must be registered by importing the protocol."
  );
});

// ---------------------------------------------------------------------------- WebView client seam

test("getPixels decodes a handle reference + metadata into a PsImageData proxy", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const transport = { ...(await makeImageDataTransport()), sourceBounds: { left: 0, top: 0, right: 2, bottom: 1 }, level: 0 };
  const rpc = createRecordingRpc([transport]);
  const imaging = createImagingNamespace(rpc);

  const result = await imaging.getPixels({ documentID: 1, layerID: 2 });

  assert.equal(rpc.calls.length, 1);
  assert.equal(rpc.calls[0].module, IMAGING_MODULE_ID);
  assert.equal(rpc.calls[0].method, "imaging.getPixels");
  assert.deepEqual(rpc.calls[0].args, [{ documentID: 1, layerID: 2 }]);
  // Metadata is answered locally from the snapshot, no extra RPC.
  assert.equal(result.imageData.width, 2);
  assert.equal(result.imageData.componentSize, 8);
  assert.equal(result.imageData.hasAlpha, true);
  assert.deepEqual(result.sourceBounds, { left: 0, top: 0, right: 2, bottom: 1 });
  assert.equal(result.level, 0);
});

test("getData reconstructs the typed array implied by componentSize", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const { bytesToTransport } = await import(binaryTransportModule);

  // componentSize 16 → Uint16Array. Bytes are little-endian [1,0, 2,0] → [1, 2].
  const transport16 = await makeImageDataTransport({ componentSize: 16 });
  const dataEnvelope = bytesToTransport(new Uint8Array([1, 0, 2, 0]));
  const rpc = createRecordingRpc([transport16, dataEnvelope]);
  const imaging = createImagingNamespace(rpc);

  const { imageData } = await imaging.getPixels({ layerID: 1 });
  const data = await imageData.getData({ chunky: true });

  assert.ok(data instanceof Uint16Array, "componentSize 16 must reconstruct a Uint16Array.");
  assert.deepEqual(Array.from(data), [1, 2]);
  // getData issues one RPC carrying the handle reference + options.
  const getDataCall = rpc.calls.find((c) => c.method === "imaging.imageData.getData");
  assert.ok(getDataCall, "getData should issue an imaging.imageData.getData RPC.");
  assert.equal(getDataCall.args[0].type, PS_IMAGE_DATA_TYPE);
  assert.deepEqual(getDataCall.args[1], { chunky: true });
});

test("putPixels sends the handle reference, never the bytes", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const rpc = createRecordingRpc([await makeImageDataTransport(), undefined]);
  const imaging = createImagingNamespace(rpc);

  const { imageData } = await imaging.getPixels({ layerID: 3 });
  await imaging.putPixels({ layerID: 3, imageData, replace: true });

  const putCall = rpc.calls.find((c) => c.method === "imaging.putPixels");
  assert.ok(putCall, "putPixels should issue an imaging.putPixels RPC.");
  const sentOptions = putCall.args[0];
  assert.equal(sentOptions.imageData.type, PS_IMAGE_DATA_TYPE, "putPixels must send the handle reference.");
  assert.equal(sentOptions.replace, true, "other options must pass through verbatim.");
  assert.equal(sentOptions.layerID, 3);
});

test("createImageDataFromBuffer envelopes the input buffer exactly once", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const { isBinaryTransportData } = await import(binaryTransportModule);
  const rpc = createRecordingRpc([await makeImageDataTransport()]);
  const imaging = createImagingNamespace(rpc);

  const buffer = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
  await imaging.createImageDataFromBuffer(buffer, { width: 2, height: 1, components: 4, colorSpace: "RGB" });

  assert.equal(rpc.calls.length, 1);
  const [transport, options] = rpc.calls[0].args;
  assert.equal(isBinaryTransportData(transport), true, "the buffer must cross as a binary transport envelope.");
  assert.deepEqual(options, { width: 2, height: 1, components: 4, colorSpace: "RGB" });
});

test("createImageDataFromBuffer supports old and chained await forms", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const rpc = createRecordingRpc([await makeImageDataTransport(), undefined, await makeImageDataTransport(), undefined]);
  const imaging = createImagingNamespace(rpc);
  const options = { width: 1, height: 1, components: 4, colorSpace: "RGB" };

  const imageData = await imaging.createImageDataFromBuffer(new Uint8Array(4), options);
  await imageData.dispose();
  await imaging.createImageDataFromBuffer(new Uint8Array(4), options).dispose();

  assert.deepEqual(
    rpc.calls.map(({ method }) => method),
    [
      "imaging.createImageDataFromBuffer",
      "imaging.imageData.dispose",
      "imaging.createImageDataFromBuffer",
      "imaging.imageData.dispose"
    ]
  );
});

test("dispose issues an imaging.imageData.dispose RPC carrying the reference", async () => {
  const { createImagingNamespace } = await import(imagingModule);
  const rpc = createRecordingRpc([await makeImageDataTransport(), undefined]);
  const imaging = createImagingNamespace(rpc);

  const { imageData } = await imaging.getPixels({ layerID: 4 });
  await imageData.dispose();

  const disposeCall = rpc.calls.find((c) => c.method === "imaging.imageData.dispose");
  assert.ok(disposeCall, "dispose should issue an imaging.imageData.dispose RPC.");
  assert.equal(disposeCall.args[0].type, PS_IMAGE_DATA_TYPE);
});

// ---------------------------------------------------------------------------- UXP host seam

test("host getPixels accepts Photoshop's function-shaped imageData and returns metadata", async () => {
  const { dispatchImagingCall, destroyImagingHandles } = await import(hostModule);

  // Photoshop 26.10 exposes PhotoshopImageData as a callable host object (`typeof === "function"`)
  // with metadata properties. Keep this exact runtime shape in the regression seam.
  const nativeImageData = Object.assign(function PhotoshopImageData() {}, {
    width: 3,
    height: 2,
    components: 4,
    componentSize: 8,
    colorSpace: "RGB",
    colorProfile: "sRGB",
    hasAlpha: true,
    pixelFormat: "RGBA",
    chunky: true,
    type: "PhotoshopImageData",
    async getData() {
      return new Uint8Array([9, 8, 7]);
    },
    dispose() {}
  });
  const stub = {
    imaging: {
      async getPixels() {
        return { imageData: nativeImageData, sourceBounds: { left: 0, top: 0, right: 3, bottom: 2 }, level: 1 };
      }
    },
    core: {
      async executeAsModal(fn) {
        return fn({});
      }
    }
  };

  await withPhotoshopRequire(stub, async () => {
    const result = await dispatchImagingCall("imaging.getPixels", [{ layerID: 5 }]);
    assert.equal(result.imageData.type, PS_IMAGE_DATA_TYPE, "host must return a PsImageData reference.");
    assert.equal(result.metadata.valueKind, "PsImageDataMetadata");
    assert.deepEqual(result.sourceBounds, { left: 0, top: 0, right: 3, bottom: 2 });
    assert.equal(result.level, 1);

    // The registered handle can be read back: getData envelopes the native bytes.
    const envelope = await dispatchImagingCall("imaging.imageData.getData", [result.imageData, {}]);
    assert.equal(envelope.kind, "bytes");
    assert.deepEqual(envelope.value, [9, 8, 7]);
    destroyImagingHandles();
  });
});

test("host putPixels resolves the handle reference to the native object under a modal scope", async () => {
  const { dispatchImagingCall, destroyImagingHandles } = await import(hostModule);

  const nativeImageData = {
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
      return new Uint8Array([0]);
    },
    dispose() {}
  };
  let putReceived;
  let modalCount = 0;
  const stub = {
    imaging: {
      async getPixels() {
        return { imageData: nativeImageData, sourceBounds: {}, level: 0 };
      },
      async putPixels(options) {
        putReceived = options;
      }
    },
    core: {
      async executeAsModal(fn) {
        modalCount += 1;
        return fn({});
      }
    }
  };

  await withPhotoshopRequire(stub, async () => {
    const read = await dispatchImagingCall("imaging.getPixels", [{ layerID: 6 }]);
    await dispatchImagingCall("imaging.putPixels", [{ layerID: 6, imageData: read.imageData, replace: false }]);

    assert.equal(putReceived.imageData, nativeImageData, "put must receive the resolved native imageData.");
    assert.equal(putReceived.replace, false, "other options must pass through.");
    assert.equal(modalCount, 2, "both getPixels and putPixels run inside executeAsModal.");
    destroyImagingHandles();
  });
});

test("host createImageDataFromBuffer decodes the transport and registers a handle", async () => {
  const { dispatchImagingCall, destroyImagingHandles } = await import(hostModule);
  const { bytesToTransport } = await import(binaryTransportModule);

  let receivedBuffer;
  const built = {
    width: 2,
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
      return new Uint8Array([1]);
    },
    dispose() {}
  };
  const stub = {
    imaging: {
      async createImageDataFromBuffer(buffer) {
        receivedBuffer = buffer;
        return built;
      }
    },
    core: {
      async executeAsModal(fn) {
        return fn({});
      }
    }
  };

  await withPhotoshopRequire(stub, async () => {
    const envelope = bytesToTransport(new Uint8Array([5, 6, 7, 8]));
    const result = await dispatchImagingCall("imaging.createImageDataFromBuffer", [
      envelope,
      { width: 2, height: 1, components: 4, colorSpace: "RGB" }
    ]);
    assert.ok(receivedBuffer instanceof Uint8Array, "the host must decode the transport to a Uint8Array.");
    assert.deepEqual(Array.from(receivedBuffer), [5, 6, 7, 8]);
    assert.equal(result.imageData.type, PS_IMAGE_DATA_TYPE);
    destroyImagingHandles();
  });
});

test("host rejects unknown imaging method names", async () => {
  const { dispatchImagingCall } = await import(hostModule);
  await withPhotoshopRequire({ imaging: {}, core: {} }, async () => {
    assert.throws(() => dispatchImagingCall("imaging.bogus", [{}]), /Unsupported photoshop imaging method/);
  });
});
