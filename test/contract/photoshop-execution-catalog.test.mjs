import assert from "node:assert/strict";
import { test } from "node:test";

test("Photoshop execution catalog covers every protocol method exactly once", async () => {
  const catalog = await import("../../dist/uxp/photoshop-execution-catalog.js");
  const core = await import("../../dist/shared/photoshop-api/core-protocol.js");
  const imaging = await import("../../dist/shared/photoshop-api/imaging-protocol.js");
  const dom = await import("../../dist/shared/photoshop-api/photoshop-protocol.js");
  const expected = [
    ...core.PHOTOSHOP_CORE_METHOD_NAMES.map((method) => [core.PHOTOSHOP_CORE_MODULE_ID, method]),
    ...core.PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES.map((method) => [core.PHOTOSHOP_CORE_MODULE_ID, method]),
    ...imaging.PHOTOSHOP_IMAGING_METHOD_NAMES.map((method) => [imaging.PHOTOSHOP_IMAGING_MODULE_ID, method]),
    ...dom.PHOTOSHOP_METHOD_NAMES.map((method) => [dom.PHOTOSHOP_MODULE_ID, method])
  ];
  const actual = catalog.PHOTOSHOP_EXECUTION_CATALOG.map(({ moduleId, method }) => [moduleId, method]);
  assert.equal(new Set(actual.map((entry) => entry.join("\0"))).size, actual.length);
  assert.deepEqual(new Set(actual.map((entry) => entry.join("\0"))), new Set(expected.map((entry) => entry.join("\0"))));
  assert.equal(catalog.resolvePhotoshopExecutionClass(core.PHOTOSHOP_CORE_MODULE_ID, "core.apiVersion"), "read");
  assert.equal(catalog.resolvePhotoshopExecutionClass(core.PHOTOSHOP_CORE_MODULE_ID, "core.executeAsModal"), "modal-entry");
  assert.equal(catalog.resolvePhotoshopExecutionClass(core.PHOTOSHOP_CORE_MODULE_ID, "modal.reportProgress"), "nested-only");
  assert.equal(catalog.resolvePhotoshopExecutionClass(imaging.PHOTOSHOP_IMAGING_MODULE_ID, "imaging.putPixels"), "modal-aware-mutation");
  assert.equal(catalog.resolvePhotoshopExecutionClass(dom.PHOTOSHOP_MODULE_ID, "action.batchPlay"), "modal-aware-mutation");
});

test("module registry propagates representative catalog classes into adapters", async () => {
  const { createUxpModuleRegistry } = await import("../../dist/uxp/module-registry.js");
  const core = await import("../../dist/shared/photoshop-api/core-protocol.js");
  const imaging = await import("../../dist/shared/photoshop-api/imaging-protocol.js");
  const dom = await import("../../dist/shared/photoshop-api/photoshop-protocol.js");
  const seen = [];
  const adapters = [
    [core.PHOTOSHOP_CORE_MODULE_ID, "photoshop.core"],
    [imaging.PHOTOSHOP_IMAGING_MODULE_ID, "photoshop.imaging"],
    [dom.PHOTOSHOP_MODULE_ID, "photoshop.batchPlay"]
  ].map(([moduleId, capability]) => ({
    moduleId,
    resolveCapability: () => capability,
    dispatch: (method, _args, context) => seen.push([moduleId, method, context.executionClass])
  }));
  const registry = createUxpModuleRegistry(
    new Set(["photoshop.core", "photoshop.imaging", "photoshop.batchPlay"]),
    adapters
  );
  registry.dispatch({ module: core.PHOTOSHOP_CORE_MODULE_ID, method: "core.apiVersion", args: [] });
  registry.dispatch({ module: imaging.PHOTOSHOP_IMAGING_MODULE_ID, method: "imaging.putPixels", args: [] });
  registry.dispatch({ module: dom.PHOTOSHOP_MODULE_ID, method: "action.batchPlay", args: [] });
  assert.deepEqual(seen.map((entry) => entry[2]), [
    "read",
    "modal-aware-mutation",
    "modal-aware-mutation"
  ]);
});
