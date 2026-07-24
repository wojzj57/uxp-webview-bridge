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
const colorSamplerModule = "../../dist/webview/photoshop-api/modules/photoshop/color-sampler.js";
const countItemModule = "../../dist/webview/photoshop-api/modules/photoshop/count-item.js";
const layerCompModule = "../../dist/webview/photoshop-api/modules/photoshop/layer-comp.js";
const selectionModule = "../../dist/webview/photoshop-api/modules/photoshop/selection.js";
const historyStateModule = "../../dist/webview/photoshop-api/modules/photoshop/history-state.js";
const guideModule = "../../dist/webview/photoshop-api/modules/photoshop/guide.js";
const pathItemModule = "../../dist/webview/photoshop-api/modules/photoshop/path-item.js";
const subPathItemModule = "../../dist/webview/photoshop-api/modules/photoshop/sub-path-item.js";
const pathPointModule = "../../dist/webview/photoshop-api/modules/photoshop/path-point.js";
const appModule = "../../dist/webview/photoshop-api/modules/photoshop/app.js";
const textFontModule = "../../dist/webview/photoshop-api/modules/photoshop/text-font.js";
const toolModule = "../../dist/webview/photoshop-api/modules/photoshop/tool.js";
const actionsModule = "../../dist/webview/photoshop-api/modules/photoshop/actions.js";
const preferencesModule = "../../dist/webview/photoshop-api/modules/photoshop/preferences.js";
const textModule = "../../dist/webview/photoshop-api/modules/photoshop/text.js";

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
    } else if (descriptor.refTypes !== undefined) {
      kinds[name] = { kind: "refUnion", refTypes: descriptor.refTypes };
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
        } else if (resultKind.kind === "refUnion") {
          for (const refType of resultKind.refTypes) assert.ok(knownTypes.has(refType), `${type}.${member} refType ${refType} is unregistered.`);
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
  const { createColorSamplerProperties } = await import(colorSamplerModule);
  const { createCountItemProperties } = await import(countItemModule);
  const { createLayerCompProperties } = await import(layerCompModule);
  const { createSelectionProperties, createSelectionMethods } = await import(selectionModule);
  const { createHistoryStateProperties } = await import(historyStateModule);
  const { createGuideProperties } = await import(guideModule);
  const { createPathItemProperties, createPathItemMethods } = await import(pathItemModule);
  const { createSubPathItemProperties } = await import(subPathItemModule);
  const { createPathPointProperties } = await import(pathPointModule);
  const { createAppProperties, createAppMethods } = await import(appModule);
  const { createTextFontProperties } = await import(textFontModule);
  const { createToolProperties } = await import(toolModule);
  const { createActionSetProperties, createActionProperties } = await import(actionsModule);
  const { createPreferenceProperties } = await import(preferencesModule);
  const {
    createCharacterStyleProperties,
    createParagraphStyleProperties,
    createTextItemMethods,
    createTextItemProperties,
    createTextWarpStyleProperties
  } = await import(textModule);

  const cases = [
    { type: PHOTOSHOP_REMOTE_TYPE.Photoshop, properties: declaredResultKinds(createAppProperties()), methods: declaredResultKinds(createAppMethods()) },
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
    },
    { type: PHOTOSHOP_REMOTE_TYPE.ColorSampler, properties: declaredResultKinds(createColorSamplerProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.CountItem, properties: declaredResultKinds(createCountItemProperties()), methods: {} },
    {
      type: PHOTOSHOP_REMOTE_TYPE.LayerComp,
      properties: declaredResultKinds(createLayerCompProperties()),
      methods: { duplicate: { kind: "ref", refType: PHOTOSHOP_REMOTE_TYPE.LayerComp } }
    },
    {
      type: PHOTOSHOP_REMOTE_TYPE.Selection,
      properties: declaredResultKinds(createSelectionProperties()),
      methods: declaredResultKinds(createSelectionMethods())
    },
    {
      type: PHOTOSHOP_REMOTE_TYPE.HistoryState,
      properties: declaredResultKinds(createHistoryStateProperties()),
      methods: {}
    },
    { type: PHOTOSHOP_REMOTE_TYPE.Guide, properties: declaredResultKinds(createGuideProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.PathItem, properties: declaredResultKinds(createPathItemProperties()), methods: declaredResultKinds(createPathItemMethods()) },
    { type: PHOTOSHOP_REMOTE_TYPE.SubPathItem, properties: declaredResultKinds(createSubPathItemProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.PathPoint, properties: declaredResultKinds(createPathPointProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.TextItem, properties: declaredResultKinds(createTextItemProperties()), methods: declaredResultKinds(createTextItemMethods()) },
    { type: PHOTOSHOP_REMOTE_TYPE.CharacterStyle, properties: declaredResultKinds(createCharacterStyleProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.ParagraphStyle, properties: declaredResultKinds(createParagraphStyleProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.TextWarpStyle, properties: declaredResultKinds(createTextWarpStyleProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.TextFont, properties: declaredResultKinds(createTextFontProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.Tool, properties: declaredResultKinds(createToolProperties()), methods: {} },
    { type: PHOTOSHOP_REMOTE_TYPE.ActionSet, properties: declaredResultKinds(createActionSetProperties()), methods: { duplicate: { kind: "ref", refType: PHOTOSHOP_REMOTE_TYPE.ActionSet } } },
    { type: PHOTOSHOP_REMOTE_TYPE.Action, properties: declaredResultKinds(createActionProperties()), methods: { duplicate: { kind: "ref", refType: PHOTOSHOP_REMOTE_TYPE.Action } } },
    ...[
      PHOTOSHOP_REMOTE_TYPE.Preferences,
      PHOTOSHOP_REMOTE_TYPE.PreferencesCursors,
      PHOTOSHOP_REMOTE_TYPE.PreferencesFileHandling,
      PHOTOSHOP_REMOTE_TYPE.PreferencesGeneral,
      PHOTOSHOP_REMOTE_TYPE.PreferencesGuidesGridsAndSlices,
      PHOTOSHOP_REMOTE_TYPE.PreferencesHistory,
      PHOTOSHOP_REMOTE_TYPE.PreferencesInterface,
      PHOTOSHOP_REMOTE_TYPE.PreferencesNotifications,
      PHOTOSHOP_REMOTE_TYPE.PreferencesPerformance,
      PHOTOSHOP_REMOTE_TYPE.PreferencesTools,
      PHOTOSHOP_REMOTE_TYPE.PreferencesTransparencyAndGamut,
      PHOTOSHOP_REMOTE_TYPE.PreferencesType,
      PHOTOSHOP_REMOTE_TYPE.PreferencesUnitsAndRulers
    ].map((type) => ({ type, properties: declaredResultKinds(createPreferenceProperties(type)), methods: {} }))
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
