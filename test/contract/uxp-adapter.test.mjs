import assert from "node:assert/strict";
import { test } from "node:test";

const baseCapabilities = {
  os: true,
  uxp: {
    shell: false,
    userInfo: false,
    secureStorage: false,
    pluginManager: false,
    script: false
  },
  photoshop: true,
  imaging: true,
  batchPlay: true,
  fs: {
    read: true,
    write: true,
    schemes: ["plugin:", "plugin-data:", "plugin-temp:"]
  }
};

test("UXP adapter reads host and version properties from require('uxp')", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      host: {
        name: "photoshop",
        version: "27.0.0",
        uiLocale: "en_US"
      },
      versions: {
        uxp: "uxp-8.0.0",
        plugin: "1.2.3"
      }
    };
  };

  try {
    assert.equal(await dispatchUxpCall("host.name", [], baseCapabilities), "photoshop");
    assert.equal(await dispatchUxpCall("versions.plugin", [], baseCapabilities), "1.2.3");
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter gates shell methods before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(
      dispatchUxpCall("shell.openExternal", ["https://example.com"], baseCapabilities),
      /uxp shell capability is disabled/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter serializes secureStorage binary values", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const capabilities = {
    ...baseCapabilities,
    uxp: {
      ...baseCapabilities.uxp,
      secureStorage: true
    }
  };
  const stored = new Map();

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      storage: {
        secureStorage: {
          get length() {
            return stored.size;
          },
          async setItem(key, value) {
            stored.set(key, value);
          },
          async getItem(key) {
            const value = stored.get(key);
            return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
          },
          async removeItem(key) {
            stored.delete(key);
          },
          key(index) {
            return Array.from(stored.keys())[index];
          },
          async clear() {
            stored.clear();
          }
        }
      }
    };
  };

  try {
    await dispatchUxpCall(
      "storage.secureStorage.setItem",
      ["token", { kind: "bytes", encoding: "array", value: [1, 2, 3] }],
      capabilities
    );
    assert.equal(await dispatchUxpCall("storage.secureStorage.length", [], capabilities), 1);
    assert.deepEqual(
      await dispatchUxpCall("storage.secureStorage.getItem", ["token"], capabilities),
      { kind: "bytes", encoding: "array", value: [1, 2, 3] }
    );
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter serializes pluginManager plugins and dispatches plugin IPC", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const calls = [];
  const capabilities = {
    ...baseCapabilities,
    uxp: {
      ...baseCapabilities.uxp,
      pluginManager: true
    }
  };

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      pluginManager: {
        plugins: new Set([
          {
            id: "com.example.plugin",
            version: "1.0.0",
            name: "Example",
            manifest: { id: "com.example.plugin" },
            enabled: true,
            async showPanel(panelId) {
              calls.push(["showPanel", panelId]);
            },
            async invokeCommand(commandId, ...params) {
              calls.push(["invokeCommand", commandId, params]);
            }
          }
        ])
      }
    };
  };

  try {
    assert.deepEqual(await dispatchUxpCall("pluginManager.plugins", [], capabilities), [
      {
        id: "com.example.plugin",
        version: "1.0.0",
        name: "Example",
        manifest: { id: "com.example.plugin" },
        enabled: true
      }
    ]);

    await dispatchUxpCall("plugin.showPanel", ["com.example.plugin", "main"], capabilities);
    await dispatchUxpCall("plugin.invokeCommand", ["com.example.plugin", "run", { ok: true }], capabilities);
    assert.deepEqual(calls, [
      ["showPanel", "main"],
      ["invokeCommand", "run", [{ ok: true }]]
    ]);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter gates pluginManager before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(
      dispatchUxpCall("pluginManager.plugins", [], baseCapabilities),
      /uxp pluginManager capability is disabled/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter dispatches script properties and setResult", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const capabilities = {
    ...baseCapabilities,
    uxp: {
      ...baseCapabilities.uxp,
      script: true
    }
  };
  const results = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      script: {
        args: ["alpha", 2],
        executionContext: { host: "test" },
        setResult(result) {
          results.push(result);
        }
      }
    };
  };

  try {
    assert.deepEqual(await dispatchUxpCall("script.args", [], capabilities), ["alpha", 2]);
    assert.deepEqual(await dispatchUxpCall("script.executionContext", [], capabilities), { host: "test" });
    await dispatchUxpCall("script.setResult", [{ done: true }], capabilities);
    assert.deepEqual(results, [{ done: true }]);
  } finally {
    restoreRequire(originalRequire);
  }
});

function restoreRequire(originalRequire) {
  if (originalRequire === undefined) {
    delete globalThis.require;
  } else {
    globalThis.require = originalRequire;
  }
}
