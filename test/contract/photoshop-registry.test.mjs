import assert from "node:assert/strict";
import { test } from "node:test";

// Contract tests run against the build (dist). These guard the ADR-0009 declarative registries:
// no dangling type/value/collection names, unique type registrations, and — crucially — that the
// shared host-side `PHOTOSHOP_RESULT_KINDS` table stays in sync with the WebView descriptor tables.
// `src/uxp` may not import `src/webview` descriptors (AGENTS.md), so the two are maintained
// separately; this test is the seam that keeps them from drifting.
const protocolModule = "../../dist/shared/photoshop-api/photoshop-protocol.js";
const valueObjectsModule = "../../dist/shared/photoshop-api/value-objects.js";
const registryModule = "../../dist/webview/photoshop-api/modules/photoshop/registry.js";
const documentModule = "../../dist/webview/photoshop-api/modules/photoshop/document.js";
const layerModule = "../../dist/webview/photoshop-api/modules/photoshop/layer.js";
const channelModule = "../../dist/webview/photoshop-api/modules/photoshop/channel.js";

const reference = (type, id) => ({ kind: "uxp.remote.ref", type, id });

/**
 * Derive the non-scalar declarative typing of a descriptor table (`{ name -> PhotoshopResultKind }`),
 * mirroring `photoshopPropertyResultKind`/`photoshopMethodResultKind`'s own classification so the two
 * can be compared field-for-field.
 */
function declaredResultKinds(descriptors) {
  const kinds = {};
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (descriptor.refType !== undefined) {
      kinds[name] = { kind: "ref", refType: descriptor.refType };
    } else if (descriptor.valueKind !== undefined) {
      kinds[name] = { kind: "value", valueKind: descriptor.valueKind };
    } else if (descriptor.collectionOf !== undefined) {
      kinds[name] = { kind: "collection", memberKind: descriptor.collectionOf };
    }
    // Scalars (no declarative typing) are intentionally omitted — the host defaults them to scalar.
  }
  return kinds;
}

test("every result-kind name resolves to a registered type or value kind (no dangling names)", async () => {
  const { PHOTOSHOP_RESULT_KINDS, PHOTOSHOP_REMOTE_TYPE } = await import(protocolModule);
  const { registeredValueKinds } = await import(valueObjectsModule);
  const knownTypes = new Set(Object.values(PHOTOSHOP_REMOTE_TYPE));
  const knownValueKinds = new Set(registeredValueKinds());

  for (const [type, table] of Object.entries(PHOTOSHOP_RESULT_KINDS)) {
    for (const group of [table.properties, table.methods]) {
      for (const [member, resultKind] of Object.entries(group)) {
        if (resultKind.kind === "ref") {
          assert.ok(knownTypes.has(resultKind.refType), `${type}.${member} refType ${resultKind.refType} is unregistered.`);
        } else if (resultKind.kind === "collection") {
          assert.ok(knownTypes.has(resultKind.memberKind), `${type}.${member} memberKind ${resultKind.memberKind} is unregistered.`);
        } else if (resultKind.kind === "value") {
          assert.ok(knownValueKinds.has(resultKind.valueKind), `${type}.${member} valueKind ${resultKind.valueKind} is unregistered.`);
        }
      }
    }
  }
});

test("the type registry registers each type once and rejects duplicates", async () => {
  const { createPhotoshopTypeRegistry } = await import(registryModule);
  const { PHOTOSHOP_REMOTE_TYPE } = await import(protocolModule);
  const registry = createPhotoshopTypeRegistry({ call: () => Promise.resolve(null) });
  const factory = (ref) => ({ ref });

  registry.register(PHOTOSHOP_REMOTE_TYPE.Document, factory);
  registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, factory);
  assert.throws(
    () => registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, factory),
    /Duplicate photoshop remote type registration: Layer/
  );

  // A registered reference resolves through the type's identity cache to a `===`-stable instance.
  const first = registry.resolveReference(reference(PHOTOSHOP_REMOTE_TYPE.Layer, "L1"));
  const again = registry.resolveReference(reference(PHOTOSHOP_REMOTE_TYPE.Layer, "L1"));
  assert.equal(first, again, "same id must resolve to the same instance (identity dedup).");
});

test("the WebView descriptor typings stay in sync with the shared PHOTOSHOP_RESULT_KINDS table", async () => {
  const { PHOTOSHOP_RESULT_KINDS, PHOTOSHOP_REMOTE_TYPE } = await import(protocolModule);
  const { createDocumentProperties, createDocumentMethods } = await import(documentModule);
  const { createLayerProperties, createLayerMethods } = await import(layerModule);
  const { createChannelProperties, createChannelMethods } = await import(channelModule);

  const cases = [
    {
      type: PHOTOSHOP_REMOTE_TYPE.Document,
      properties: declaredResultKinds(createDocumentProperties()),
      methods: declaredResultKinds(createDocumentMethods())
    },
    {
      type: PHOTOSHOP_REMOTE_TYPE.Layer,
      properties: declaredResultKinds(createLayerProperties()),
      methods: declaredResultKinds(createLayerMethods())
    },
    {
      type: PHOTOSHOP_REMOTE_TYPE.Channel,
      properties: declaredResultKinds(createChannelProperties()),
      methods: declaredResultKinds(createChannelMethods())
    }
  ];

  for (const testCase of cases) {
    const table = PHOTOSHOP_RESULT_KINDS[testCase.type];
    assert.ok(table, `${testCase.type} must have a result-kind table.`);
    assert.deepEqual(
      testCase.properties,
      table.properties,
      `${testCase.type} property result kinds drifted from the WebView descriptors.`
    );
    assert.deepEqual(
      testCase.methods,
      table.methods,
      `${testCase.type} method result kinds drifted from the WebView descriptors.`
    );
  }
});

test("the value-object registry has unique value kinds", async () => {
  const { registeredValueKinds } = await import(valueObjectsModule);
  const kinds = registeredValueKinds();
  assert.equal(new Set(kinds).size, kinds.length, "duplicate value kinds registered.");
  assert.ok(kinds.includes("ImagingBounds"), "ImagingBounds must be registered.");
  assert.ok(kinds.includes("SolidColor"), "SolidColor must be registered.");
});
