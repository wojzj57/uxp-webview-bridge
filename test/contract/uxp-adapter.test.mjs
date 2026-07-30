import assert from "node:assert/strict";
import { test } from "node:test";

test("UXP versions adapter reads versions from require('uxp')", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      versions: {
        uxp: "uxp-9.0.0",
        plugin: "1.2.3"
      }
    };
  };

  try {
    assert.equal(await dispatchUxpCall("versions.uxp", []), "uxp-9.0.0");
    assert.equal(await dispatchUxpCall("versions.plugin", []), "1.2.3");
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP host adapter reads host properties from require('uxp').host", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      host: {
        name: "photoshop",
        version: "27.0.0",
        uiLocale: "en_US"
      }
    };
  };

  try {
    assert.equal(await dispatchUxpCall("host.name", []), "photoshop");
    assert.equal(await dispatchUxpCall("host.version", []), "27.0.0");
    assert.equal(await dispatchUxpCall("host.uiLocale", []), "en_US");
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP versions adapter rejects unsupported methods before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(() => dispatchUxpCall("host.buildNumber", []), /Unsupported uxp method: host\.buildNumber/);
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP host adapter rejects args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("host.name", ["unexpected"]),
      /uxp\.host\.name does not accept arguments/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP versions adapter rejects unexpected args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("versions.uxp", ["unexpected"]),
      /uxp\.versions\.uxp does not accept arguments/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP shell adapter dispatches supported methods to require('uxp').shell", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const calls = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      shell: {
        async openPath(path, developerText) {
          calls.push(["openPath", path, developerText]);
          return "";
        },
        async openExternal(url, developerText) {
          calls.push(["openExternal", url, developerText]);
          return "";
        }
      }
    };
  };

  try {
    assert.equal(
      await dispatchUxpCall("shell.openPath", ["plugin-data:/example.txt", "Open test file"]),
      ""
    );
    assert.equal(
      await dispatchUxpCall("shell.openExternal", ["https://example.com/", "Open test URL"]),
      ""
    );
    assert.deepEqual(calls, [
      ["openPath", "plugin-data:/example.txt", "Open test file"],
      ["openExternal", "https://example.com/", "Open test URL"]
    ]);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP shell adapter rejects invalid args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("shell.openPath", []),
      /uxp\.shell\.openPath expects 1-2 arguments/
    );
    assert.throws(
      () => dispatchUxpCall("shell.openExternal", ["FILE:///tmp/example.txt"]),
      /uxp\.shell\.openExternal does not allow file: URLs/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP userInfo adapter reads userId from require('uxp').userInfo", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      userInfo: {
        userId() {
          return "user-123";
        }
      }
    };
  };

  try {
    assert.equal(await dispatchUxpCall("userInfo.userId", []), "user-123");
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP userInfo adapter rejects args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("userInfo.userId", ["unexpected"]),
      /uxp\.userInfo\.userId does not accept arguments/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP pluginManager adapter serializes plugins and dispatches plugin IPC", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const calls = [];
  const plugin = {
    id: "com.example.plugin",
    version: "1.0.0",
    name: "Example",
    manifest: { id: "com.example.plugin", name: "Example" },
    enabled: true,
    showPanel(panelId) {
      calls.push(["showPanel", panelId]);
      return "";
    },
    async invokeCommand(commandId, ...params) {
      calls.push(["invokeCommand", commandId, params]);
    }
  };

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      pluginManager: {
        plugins: new Set([plugin])
      }
    };
  };

  try {
    assert.deepEqual(await dispatchUxpCall("pluginManager.plugins", []), [
      {
        kind: "uxp.pluginManager.plugin",
        id: "com.example.plugin",
        version: "1.0.0",
        name: "Example",
        manifest: { id: "com.example.plugin", name: "Example" },
        enabled: true
      }
    ]);
    assert.equal(await dispatchUxpCall("plugin.showPanel", ["com.example.plugin", "main"]), "");
    assert.equal(await dispatchUxpCall("plugin.invokeCommand", ["com.example.plugin", "run", { ok: true }]), undefined);
    assert.deepEqual(calls, [
      ["showPanel", "main"],
      ["invokeCommand", "run", [{ ok: true }]]
    ]);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP pluginManager adapter rejects invalid calls before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("pluginManager.plugins", ["unexpected"]),
      /uxp\.pluginManager\.plugins does not accept arguments/
    );
    assert.throws(
      () => dispatchUxpCall("plugin.showPanel", ["com.example.plugin"]),
      /uxp\.plugin\.showPanel expects 2 arguments/
    );
    assert.throws(
      () => dispatchUxpCall("plugin.invokeCommand", ["com.example.plugin", ""]),
      /uxp\.plugin\.invokeCommand commandId must be a non-empty string/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP pluginManager adapter rejects plugins without stable ids", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      pluginManager: {
        plugins: new Set([
          {
            id: "",
            version: "1.0.0",
            name: "Broken",
            manifest: {},
            enabled: true
          }
        ])
      }
    };
  };

  try {
    assert.throws(
      () => dispatchUxpCall("pluginManager.plugins", []),
      /uxp\.pluginManager plugin id must be a non-empty string/
    );
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP key-value-storage adapter dispatches secureStorage methods", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
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
            stored.set(key, typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value));
          },
          async getItem(key) {
            return stored.get(key);
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
    assert.equal(await dispatchUxpCall("storage.secureStorage.length", []), 0);
    assert.equal(
      await dispatchUxpCall("storage.secureStorage.setItem", [
        "token",
        { kind: "bytes", encoding: "array", value: [1, 2, 3] }
      ]),
      undefined
    );
    assert.equal(await dispatchUxpCall("storage.secureStorage.length", []), 1);
    assert.deepEqual(await dispatchUxpCall("storage.secureStorage.getItem", ["token"]), {
      kind: "bytes",
      encoding: "array",
      value: [1, 2, 3]
    });
    assert.equal(await dispatchUxpCall("storage.secureStorage.key", [0]), "token");
    assert.equal(await dispatchUxpCall("storage.secureStorage.removeItem", ["token"]), undefined);
    assert.equal(await dispatchUxpCall("storage.secureStorage.clear", []), undefined);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP key-value-storage adapter rejects invalid args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(
      () => dispatchUxpCall("storage.secureStorage.setItem", ["token", 123]),
      /uxp\.storage\.secureStorage\.setItem value must be string or binary transport data/
    );
    await assert.rejects(
      dispatchUxpCall("storage.secureStorage.getItem", [""]),
      /uxp\.storage\.secureStorage\.getItem key must be a non-empty string/
    );
    assert.throws(
      () => dispatchUxpCall("storage.secureStorage.key", [-1]),
      /uxp\.storage\.secureStorage\.key index must be a non-negative integer/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP persistent-file-storage adapter dispatches localFileSystem and entry methods", async () => {
  const { dispatchUxpCall, uxpModuleAdapter } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const formats = { binary: Symbol("binary"), utf8: Symbol("utf8") };
  const modes = { readOnly: Symbol("readOnly"), readWrite: Symbol("readWrite") };
  const types = { file: Symbol("file"), folder: Symbol("folder") };
  const domains = { userDocuments: Symbol("userDocuments") };
  const tokens = new Map();

  class Entry {
    constructor(name, isFile, isFolder) {
      this.isEntry = true;
      this.isFile = isFile;
      this.isFolder = isFolder;
      this.name = name;
      this.url = `plugin-data:/${name}`;
      this.nativePath = `C:/${name}`;
      this.parent = null;
    }

    toString() {
      return `${this.isFolder ? "Folder" : "File"}:${this.name}`;
    }

    async copyTo(folder) {
      const copy = this.isFolder ? new Folder(`${this.name}-copy`) : new File(`${this.name}-copy`);
      folder.entries.set(copy.name, copy);
      copy.parent = folder;
      return copy;
    }

    async moveTo(folder, options = {}) {
      if (this.parent) {
        this.parent.entries.delete(this.name);
      }
      this.name = options.newName || this.name;
      folder.entries.set(this.name, this);
      this.parent = folder;
    }

    async delete() {
      if (this.parent) {
        this.parent.entries.delete(this.name);
      }
      return 0;
    }

    async getMetadata() {
      return {
        name: this.name,
        size: this.isFile ? this.data.byteLength : 0,
        dateCreated: new Date("2026-01-02T03:04:05.000Z"),
        dateModified: new Date("2026-01-02T03:04:06.000Z"),
        isFile: this.isFile,
        isFolder: this.isFolder
      };
    }
  }

  class File extends Entry {
    constructor(name) {
      super(name, true, false);
      this.mode = modes.readWrite;
      this.data = new Uint8Array();
      this.text = "";
    }

    async read(options = {}) {
      return options.format === formats.binary ? this.data.buffer : this.text;
    }

    async write(data, options = {}) {
      if (typeof data === "string") {
        this.text = options.append ? `${this.text}${data}` : data;
        this.data = new TextEncoder().encode(this.text);
        return data.length;
      }
      this.data = new Uint8Array(data);
      this.text = new TextDecoder().decode(this.data);
      return this.data.byteLength;
    }
  }

  class Folder extends Entry {
    constructor(name) {
      super(name, false, true);
      this.entries = new Map();
    }

    async getEntries() {
      return Array.from(this.entries.values());
    }

    async createEntry(name, options = {}) {
      return options.type === types.folder ? this.createFolder(name) : this.createFile(name, options);
    }

    async createFile(name) {
      const file = new File(name);
      file.parent = this;
      this.entries.set(name, file);
      return file;
    }

    async createFolder(name) {
      const folder = new Folder(name);
      folder.parent = this;
      this.entries.set(name, folder);
      return folder;
    }

    async getEntry(filePath) {
      return this.entries.get(filePath);
    }

    async renameEntry(entry, newName) {
      this.entries.delete(entry.name);
      entry.name = newName;
      this.entries.set(newName, entry);
    }
  }

  const dataFolder = new Folder("data");
  const tempFolder = new Folder("temp");
  const pluginFolder = new Folder("plugin");

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      storage: {
        domains,
        errors: {},
        fileTypes: { all: ["*"], images: ["png"], text: ["txt"] },
        formats,
        modes,
        types,
        localFileSystem: {
          getDataFolder: async () => dataFolder,
          getTemporaryFolder: async () => tempFolder,
          getPluginFolder: async () => pluginFolder,
          createEntryWithUrl: async (url, options = {}) =>
            options.type === types.folder ? new Folder(url.split("/").pop()) : new File(url.split("/").pop()),
          getEntryWithUrl: async (url) => new File(url.split("/").pop()),
          getFsUrl: (entry) => entry.url,
          getNativePath: (entry) => entry.nativePath,
          createSessionToken: (entry) => `session:${entry.name}`,
          getEntryForSessionToken: (token) => tokens.get(token),
          createPersistentToken: async (entry) => {
            const token = `persistent:${entry.name}`;
            tokens.set(token, entry);
            return token;
          },
          getEntryForPersistentToken: async (token) => tokens.get(token),
          getFileForOpening: async () => null,
          getFileForSaving: async () => null,
          getFolder: async () => null
        }
      }
    };
  };

  try {
    const folderRef = await dispatchUxpCall("storage.localFileSystem.getDataFolder", []);
    assert.equal(folderRef.kind, "uxp.storage.entry");
    assert.equal(folderRef.type, "folder");

    const fileRef = await dispatchUxpCall("storage.folder.createFile", [folderRef, "note.txt", { overwrite: true }]);
    assert.equal(fileRef.type, "file");
    assert.equal(fileRef.entry.mode.name, "readWrite");

    assert.equal(
      await dispatchUxpCall("storage.file.write", [
        fileRef,
        { kind: "text", value: "hello" },
        { format: { kind: "uxp.storage.symbol", namespace: "formats", name: "utf8" } }
      ]),
      5
    );
    assert.equal(await dispatchUxpCall("storage.file.read", [fileRef]), "hello");

    assert.equal(
      await dispatchUxpCall("storage.file.write", [
        fileRef,
        { kind: "bytes", encoding: "array", value: [1, 2, 3] },
        { format: { kind: "uxp.storage.symbol", namespace: "formats", name: "binary" } }
      ]),
      3
    );
    assert.deepEqual(await dispatchUxpCall("storage.file.read", [
      fileRef,
      { format: { kind: "uxp.storage.symbol", namespace: "formats", name: "binary" } }
    ]), {
      kind: "bytes",
      encoding: "array",
      value: [1, 2, 3]
    });

    const nestedFolderRef = await dispatchUxpCall("storage.folder.createEntry", [
      folderRef,
      "nested",
      { type: { kind: "uxp.storage.symbol", namespace: "types", name: "folder" } }
    ]);
    assert.equal(nestedFolderRef.type, "folder");

    assert.equal(await dispatchUxpCall("storage.localFileSystem.getFsUrl", [fileRef]), "plugin-data:/note.txt");
    assert.equal(await dispatchUxpCall("storage.localFileSystem.getNativePath", [fileRef]), "C:/note.txt");
    assert.equal(await dispatchUxpCall("storage.localFileSystem.createSessionToken", [fileRef]), "session:note.txt");

    const persistentToken = await dispatchUxpCall("storage.localFileSystem.createPersistentToken", [fileRef]);
    assert.equal(persistentToken, "persistent:note.txt");
    assert.equal((await dispatchUxpCall("storage.localFileSystem.getEntryForPersistentToken", [persistentToken])).type, "file");

    assert.deepEqual(await dispatchUxpCall("storage.entry.getMetadata", [fileRef]), {
      name: "note.txt",
      size: 3,
      dateCreated: "2026-01-02T03:04:05.000Z",
      dateModified: "2026-01-02T03:04:06.000Z",
      isFile: true,
      isFolder: false
    });

    assert.equal(await dispatchUxpCall("storage.entry.dispose", [fileRef]), undefined);
    await assert.rejects(
      dispatchUxpCall("storage.file.read", [fileRef]),
      /Unknown UXP storage entry reference/
    );
    uxpModuleAdapter.destroy?.();
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP persistent-file-storage adapter rejects invalid args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(
      dispatchUxpCall("storage.localFileSystem.getEntryWithUrl", [""]),
      /storage\.localFileSystem\.getEntryWithUrl url must be a non-empty string/
    );
    await assert.rejects(
      dispatchUxpCall("storage.folder.createFile", [{ kind: "wrong" }, "note.txt"]),
      /storage\.folder\.createFile folder must be a UXP storage Entry reference/
    );
    await assert.rejects(
      dispatchUxpCall("storage.file.write", [{ kind: "uxp.storage.entry", type: "file", id: "missing" }, 123]),
      /storage\.file\.write data must be string or binary transport data|Unknown UXP storage entry reference/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP xmp adapter dispatches XMPMeta handles", async () => {
  const { dispatchUxpCall, uxpModuleAdapter } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  const calls = [];

  class XMPMeta {
    constructor(packet) {
      this.packet = packet || "";
      this.values = new Map();
    }

    setProperty(schemaNS, propName, value) {
      calls.push(["setProperty", schemaNS, propName, value]);
      this.values.set(`${schemaNS}:${propName}`, value);
    }

    getProperty(schemaNS, propName) {
      calls.push(["getProperty", schemaNS, propName]);
      const value = this.values.get(`${schemaNS}:${propName}`);
      return value === undefined
        ? null
        : {
            locale: "",
            namespace: schemaNS,
            options: 0,
            path: propName,
            value,
            toString() {
              return String(value);
            }
          };
    }

    serialize() {
      return `<xmp>${this.packet}</xmp>`;
    }
  }

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "uxp");
    return {
      xmp: {
        XMPMeta
      }
    };
  };

  try {
    const metaRef = await dispatchUxpCall("xmp.meta.create", ["packet"]);
    assert.equal(metaRef.kind, "uxp.remote.ref");
    assert.equal(metaRef.type, "XMPMeta");

    assert.equal(
      await dispatchUxpCall("xmp.meta.setProperty", [
        metaRef,
        "http://ns.adobe.com/xap/1.0/",
        "CreatorTool",
        "Bridge"
      ]),
      undefined
    );
    assert.deepEqual(await dispatchUxpCall("xmp.meta.getProperty", [metaRef, "http://ns.adobe.com/xap/1.0/", "CreatorTool"]), {
      locale: "",
      namespace: "http://ns.adobe.com/xap/1.0/",
      options: 0,
      path: "CreatorTool",
      value: "Bridge",
      stringValue: "Bridge"
    });
    assert.equal(await dispatchUxpCall("xmp.meta.serialize", [metaRef]), "<xmp>packet</xmp>");
    assert.equal(await dispatchUxpCall("xmp.meta.dispose", [metaRef]), undefined);
    uxpModuleAdapter.destroy?.();
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP xmp adapter rejects invalid args before requiring uxp", async () => {
  const { dispatchUxpCall } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    assert.throws(() => dispatchUxpCall("xmp.meta.setProperty", []), /xmp\.meta\.setProperty expects 4-6 arguments/);
    assert.throws(
      () => dispatchUxpCall("xmp.dateTime.getProperty", [{ kind: "wrong" }, "year"]),
      /requires an XMP remote reference/
    );
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP module registry gates each namespaced leaf independently", async () => {
  const { createUxpModuleRegistry } = await import("../../dist/uxp/module-registry.js");
  const { uxpModuleAdapter } = await import("../../dist/uxp/uxp-api/modules/uxp/index.js");
  const { UXP_MODULE_ID } = await import("../../dist/shared/uxp-api/uxp-protocol.js");
  const originalRequire = globalThis.require;
  let required = false;

  globalThis.require = (moduleName) => {
    required = true;
    assert.equal(moduleName, "uxp");
    return {
      versions: {
        uxp: "uxp-9.0.0",
        plugin: "1.2.3"
      }
    };
  };

  const registry = createUxpModuleRegistry(
    new Set(["uxp.versions"]),
    [uxpModuleAdapter]
  );

  try {
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "shell.openPath", args: ["plugin-data:/x"] }),
      /Bridge capability uxp\.shell denied operation/
    );
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "userInfo.userId", args: [] }),
      /Bridge capability uxp\.userInfo denied operation/
    );
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "pluginManager.plugins", args: [] }),
      /Bridge capability uxp\.pluginManager denied operation/
    );
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "storage.secureStorage.length", args: [] }),
      /Bridge capability uxp\.storage\.secureStorage denied operation/
    );
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "storage.localFileSystem.getDataFolder", args: [] }),
      /Bridge capability uxp\.storage\.localFileSystem denied operation/
    );
    assert.throws(
      () => registry.dispatch({ module: UXP_MODULE_ID, method: "xmp.meta.create", args: [] }),
      /Bridge capability uxp\.xmp denied operation/
    );
    assert.equal(required, false);
    assert.equal(
      registry.dispatch({ module: UXP_MODULE_ID, method: "versions.uxp", args: [] }),
      "uxp-9.0.0"
    );
    assert.equal(required, true);
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
