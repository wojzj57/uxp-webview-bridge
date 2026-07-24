import assert from "node:assert/strict";
import { test } from "node:test";

test("UXP os adapter dispatches supported methods to require('os')", async () => {
  const { dispatchOsCall } = await import("../../dist/uxp/uxp-api/modules/os/host.js");
  const originalRequire = globalThis.require;
  const calls = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "os");
    return {
      platform() {
        calls.push("platform");
        return "test-platform";
      }
    };
  };

  try {
    assert.equal(dispatchOsCall("platform", []), "test-platform");
    assert.deepEqual(calls, ["platform"]);
  } finally {
    if (originalRequire === undefined) {
      delete globalThis.require;
    } else {
      globalThis.require = originalRequire;
    }
  }
});

test("UXP os adapter rejects unsupported methods before requiring os", async () => {
  const { dispatchOsCall } = await import("../../dist/uxp/uxp-api/modules/os/host.js");

  assert.throws(
    () => dispatchOsCall("notARealMethod", []),
    /Unsupported os method: notARealMethod/
  );
});

test("UXP os adapter rejects unexpected arguments before requiring os", async () => {
  const { dispatchOsCall } = await import("../../dist/uxp/uxp-api/modules/os/host.js");

  assert.throws(
    () => dispatchOsCall("platform", ["unexpected"]),
    /os\.platform does not accept arguments/
  );
});
