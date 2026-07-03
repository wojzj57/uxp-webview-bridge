import assert from "node:assert/strict";
import { test } from "node:test";

const baseCapabilities = {
  os: true,
  uxp: {
    shell: false,
    userInfo: false,
    secureStorage: false,
    pluginManager: false,
    script: false,
    entrypoints: false
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

test("UXP adapter serializes entrypoint panels and menu operations", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const capabilities = {
    ...baseCapabilities,
    uxp: {
      ...baseCapabilities.uxp,
      entrypoints: true
    }
  };
  const menuItem = {
    id: "signIn",
    label: "Sign In",
    enabled: true,
    checked: false,
    removeCalled: false,
    remove() {
      this.removeCalled = true;
    }
  };
  const menuItems = {
    get size() {
      return 1;
    },
    getItem(id) {
      return id === menuItem.id ? menuItem : null;
    },
    getItemAt(index) {
      return index === 0 ? menuItem : null;
    },
    insertions: [],
    removals: [],
    insertAt(index, newItem) {
      this.insertions.push([index, newItem]);
    },
    removeAt(index) {
      this.removals.push(index);
    }
  };

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      entrypoints: {
        getPanel(id) {
          return id === "main"
            ? {
                id: "main",
                label: "Main",
                description: "Main panel",
                shortcut: { shortcutKey: "M", commandKey: true },
                title: "Main Panel",
                icons: [],
                minimumSize: { width: 100, height: 100 },
                maximumSize: { width: 1000, height: 1000 },
                preferredDockedSize: { width: 300, height: 400 },
                preferredFloatingSize: { width: 320, height: 420 },
                menuItems
              }
            : null;
        },
        getCommand(id) {
          return id === "run"
            ? {
                id: "run",
                label: "Run",
                description: "Run command",
                shortcut: { shortcutKey: "R" },
                isManifestCommand: true,
                commandOptions: { enabled: true }
              }
            : null;
        }
      }
    };
  };

  try {
    const panel = await dispatchUxpCall("entrypoints.getPanel", ["main"], capabilities);
    assert.equal(panel.id, "main");
    assert.equal(panel.menuItems.kind, "uxp.entrypoints.menuItems");

    assert.equal(await dispatchUxpCall("entrypoints.menuItems.size", [panel.menuItems], capabilities), 1);
    const item = await dispatchUxpCall(
      "entrypoints.menuItems.getItem",
      [panel.menuItems, "signIn"],
      capabilities
    );
    assert.equal(item.itemId, "signIn");

    await dispatchUxpCall("entrypoints.menuItem.setLabel", [item, "Sign in now"], capabilities);
    await dispatchUxpCall("entrypoints.menuItem.setEnabled", [item, false], capabilities);
    await dispatchUxpCall("entrypoints.menuItem.setChecked", [item, true], capabilities);
    await dispatchUxpCall("entrypoints.menuItem.remove", [item], capabilities);
    assert.equal(await dispatchUxpCall("entrypoints.menuItem.getLabel", [item], capabilities), "Sign in now");
    assert.equal(await dispatchUxpCall("entrypoints.menuItem.getEnabled", [item], capabilities), false);
    assert.equal(await dispatchUxpCall("entrypoints.menuItem.getChecked", [item], capabilities), true);
    assert.equal(menuItem.label, "Sign in now");
    assert.equal(menuItem.enabled, false);
    assert.equal(menuItem.checked, true);
    assert.equal(menuItem.removeCalled, true);

    await dispatchUxpCall(
      "entrypoints.menuItems.insertAt",
      [panel.menuItems, 1, { id: "settings", label: "Settings" }],
      capabilities
    );
    await dispatchUxpCall("entrypoints.menuItems.removeAt", [panel.menuItems, 0], capabilities);
    assert.deepEqual(menuItems.insertions, [[1, { id: "settings", label: "Settings" }]]);
    assert.deepEqual(menuItems.removals, [0]);

    assert.deepEqual(await dispatchUxpCall("entrypoints.getCommand", ["run"], capabilities), {
      id: "run",
      label: "Run",
      description: "Run command",
      shortcut: { shortcutKey: "R" },
      isManifestCommand: true,
      commandOptions: { enabled: true }
    });
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP adapter rejects entrypoints.setup through the bridge", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const capabilities = {
    ...baseCapabilities,
    uxp: {
      ...baseCapabilities.uxp,
      entrypoints: true
    }
  };

  await assert.rejects(
    dispatchUxpCall("entrypoints.setup", [{}], capabilities),
    /uxp\.entrypoints\.setup cannot be called through the WebView bridge/
  );
});

test("UXP adapter gates entrypoints before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(
      dispatchUxpCall("entrypoints.getPanel", ["main"], baseCapabilities),
      /uxp entrypoints capability is disabled/
    );
    assert.equal(required, false);
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
