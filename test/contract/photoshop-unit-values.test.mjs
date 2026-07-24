import assert from "node:assert/strict";
import { test } from "node:test";

const layerModule = "../../dist/webview/photoshop-api/modules/photoshop/layer.js";
const registryModule = "../../dist/webview/photoshop-api/modules/photoshop/registry.js";
const protocolModule = "../../dist/shared/photoshop-api/photoshop-protocol.js";

test("Layer transforms preserve unit value objects across the WebView RPC boundary", async () => {
  const { createLayerClass } = await import(layerModule);
  const { createPhotoshopTypeRegistry } = await import(registryModule);
  const { PHOTOSHOP_REMOTE_TYPE } = await import(protocolModule);
  const calls = [];
  const rpc = {
    call(module, method, args) {
      calls.push({ module, method, args });
      return Promise.resolve(undefined);
    }
  };
  const registry = createPhotoshopTypeRegistry(rpc);
  const placeholder = (remoteReference) => ({ toRemoteReference: () => Promise.resolve(remoteReference) });
  registry.register(PHOTOSHOP_REMOTE_TYPE.Document, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, placeholder);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Channel, placeholder);

  const reference = { kind: "uxp.remote.ref", type: PHOTOSHOP_REMOTE_TYPE.Layer, id: "Layer-1" };
  const LayerClass = createLayerClass({ rpc, registry });
  const layer = new LayerClass(reference);
  const pixelOffset = { _unit: "pixelsUnit", _value: 12 };
  const percentOffset = { _unit: "percentUnit", _value: -25 };
  const percentScale = { _unit: "percentUnit", _value: 80 };
  const angle = { _unit: "angleUnit", _value: 15 };

  await layer.translate(pixelOffset, percentOffset);
  await layer.scale(percentScale, percentScale, "middle-center");
  await layer.rotate(angle, "top-left");

  assert.deepEqual(
    calls.map(({ method, args }) => ({ method, args })),
    [
      { method: "layer.translate", args: [reference, pixelOffset, percentOffset] },
      { method: "layer.scale", args: [reference, percentScale, percentScale, "middle-center"] },
      { method: "layer.rotate", args: [reference, angle, "top-left"] }
    ]
  );
});
