import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView uxp.host serializes property reads through the uxp module", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      return {
        "host.name": "photoshop",
        "host.version": "27.0.0",
        "host.uiLocale": "en_US"
      }[method];
    }
  });

  assert.equal(await uxp.host.name, "photoshop");
  assert.equal(await uxp.host.version, "27.0.0");
  assert.equal(await uxp.host.uiLocale, "en_US");
  assert.deepEqual(calls, [
    ["uxp-api/modules/uxp", "host.name", undefined],
    ["uxp-api/modules/uxp", "host.version", undefined],
    ["uxp-api/modules/uxp", "host.uiLocale", undefined]
  ]);
});

test("WebView uxp.shell serializes calls through the uxp module", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      return "";
    }
  });

  assert.equal(await uxp.shell.openPath("plugin-data:/example.txt", "Open test file"), "");
  assert.equal(await uxp.shell.openExternal(new URL("https://example.com/"), "Open test URL"), "");

  assert.deepEqual(calls, [
    ["uxp-api/modules/uxp", "shell.openPath", ["plugin-data:/example.txt", "Open test file"]],
    ["uxp-api/modules/uxp", "shell.openExternal", ["https://example.com/", "Open test URL"]]
  ]);
});

test("WebView uxp.pluginManager creates plugin proxies", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      if (method === "pluginManager.plugins") {
        return [
          {
            kind: "uxp.pluginManager.plugin",
            id: "com.example.plugin",
            version: "1.0.0",
            name: "Example",
            manifest: { id: "com.example.plugin" },
            enabled: true
          }
        ];
      }
      return undefined;
    }
  });

  const plugins = await uxp.pluginManager.plugins;
  assert.equal(Array.isArray(plugins), true);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].id, "com.example.plugin");
  assert.deepEqual(plugins[0].manifest, { id: "com.example.plugin" });
  assert.equal(typeof plugins[0].showPanel, "function");
  assert.equal(typeof plugins[0].invokeCommand, "function");

  await plugins[0].showPanel("main");
  await plugins[0].invokeCommand("run", { ok: true });

  assert.deepEqual(calls, [
    ["uxp-api/modules/uxp", "pluginManager.plugins", undefined],
    ["uxp-api/modules/uxp", "plugin.showPanel", ["com.example.plugin", "main"]],
    ["uxp-api/modules/uxp", "plugin.invokeCommand", ["com.example.plugin", "run", { ok: true }]]
  ]);
});

test("WebView uxp.xmp.XMPConst is synchronous and does not call the bridge", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  let called = false;
  const uxp = createUxpNamespace({
    async call() {
      called = true;
      return undefined;
    }
  });

  assert.equal(uxp.xmp.XMPConst.NS_XMP, "http://ns.adobe.com/xap/1.0/");
  assert.equal(uxp.xmp.XMPConst.FILE_WEBP, 1464156752);
  assert.equal(uxp.xmp.XMPConst.XMPDATE, "xmpdate");
  assert.equal(Object.isFrozen(uxp.xmp.XMPConst), true);
  assert.equal(called, false);
});

test("WebView uxp.storage.secureStorage serializes through the uxp module", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      if (method === "storage.secureStorage.length") {
        return 1;
      }
      if (method === "storage.secureStorage.getItem") {
        return { kind: "bytes", encoding: "array", value: [4, 5, 6] };
      }
      if (method === "storage.secureStorage.key") {
        return "token";
      }
      return undefined;
    }
  });

  assert.equal(await uxp.storage.secureStorage.length, 1);
  await uxp.storage.secureStorage.setItem("token", new Uint8Array([1, 2, 3]));
  assert.deepEqual(Array.from(await uxp.storage.secureStorage.getItem("token")), [4, 5, 6]);
  assert.equal(await uxp.storage.secureStorage.key(0), "token");
  await uxp.storage.secureStorage.removeItem("token");
  await uxp.storage.secureStorage.clear();

  assert.deepEqual(calls, [
    ["uxp-api/modules/uxp", "storage.secureStorage.length", undefined],
    [
      "uxp-api/modules/uxp",
      "storage.secureStorage.setItem",
      ["token", { kind: "bytes", encoding: "array", value: [1, 2, 3] }]
    ],
    ["uxp-api/modules/uxp", "storage.secureStorage.getItem", ["token"]],
    ["uxp-api/modules/uxp", "storage.secureStorage.key", [0]],
    ["uxp-api/modules/uxp", "storage.secureStorage.removeItem", ["token"]],
    ["uxp-api/modules/uxp", "storage.secureStorage.clear", undefined]
  ]);
});

test("WebView uxp.storage.localFileSystem creates storage entry proxies", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const folderRef = storageRef("folder", "folder-1", { name: "data", isFolder: true, isFile: false });
  const fileRef = storageRef("file", "file-1", {
    name: "note.txt",
    isFolder: false,
    isFile: true,
    mode: { kind: "uxp.storage.symbol", namespace: "modes", name: "readWrite" }
  });
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      if (method === "storage.localFileSystem.getDataFolder") {
        return folderRef;
      }
      if (method === "storage.folder.createFile") {
        return fileRef;
      }
      if (method === "storage.file.read") {
        return args?.[1]?.format?.name === "binary"
          ? { kind: "bytes", encoding: "array", value: [1, 2, 3] }
          : "hello";
      }
      if (method === "storage.file.write") {
        return 5;
      }
      if (method === "storage.entry.getMetadata") {
        return {
          name: "note.txt",
          size: 5,
          dateCreated: "2026-01-02T03:04:05.000Z",
          dateModified: "2026-01-02T03:04:06.000Z",
          isFile: true,
          isFolder: false
        };
      }
      if (method === "storage.localFileSystem.createPersistentToken") {
        return "persistent-token";
      }
      if (method === "storage.localFileSystem.getEntryForPersistentToken") {
        return fileRef;
      }
      return undefined;
    }
  });

  assert.equal(typeof uxp.storage.localFileSystem.getDataFolder, "function");
  assert.equal(uxp.storage.File.isFile(null), false);
  assert.equal(uxp.storage.Folder.isFolder(null), false);
  assert.equal(uxp.storage.FileSystemProvider.isFileSystemProvider(uxp.storage.localFileSystem), true);

  const folder = await uxp.storage.localFileSystem.getDataFolder();
  assert.equal(folder instanceof uxp.storage.Folder, true);
  assert.equal(folder.provider, uxp.storage.localFileSystem);

  const file = await folder.createFile("note.txt", { overwrite: true });
  assert.equal(file instanceof uxp.storage.File, true);
  assert.equal(uxp.storage.File.isFile(file), true);
  assert.equal(file.mode, uxp.storage.modes.readWrite);

  assert.equal(await file.write("hello", { format: uxp.storage.formats.utf8 }), 5);
  assert.equal(await file.read(), "hello");
  assert.deepEqual(Array.from(new Uint8Array(await file.read({ format: uxp.storage.formats.binary }))), [1, 2, 3]);

  const metadata = await file.getMetadata();
  assert.equal(metadata.dateCreated instanceof Date, true);
  assert.equal(metadata.dateCreated.toISOString(), "2026-01-02T03:04:05.000Z");

  assert.equal(await uxp.storage.localFileSystem.createPersistentToken(file), "persistent-token");
  assert.equal((await uxp.storage.localFileSystem.getEntryForPersistentToken("persistent-token")).name, "note.txt");

  assert.deepEqual(calls, [
    ["uxp-api/modules/uxp", "storage.localFileSystem.getDataFolder", undefined],
    ["uxp-api/modules/uxp", "storage.folder.createFile", [folderRef, "note.txt", { overwrite: true }]],
    [
      "uxp-api/modules/uxp",
      "storage.file.write",
      [
        fileRef,
        { kind: "text", value: "hello" },
        { format: { kind: "uxp.storage.symbol", namespace: "formats", name: "utf8" } }
      ]
    ],
    ["uxp-api/modules/uxp", "storage.file.read", [fileRef]],
    [
      "uxp-api/modules/uxp",
      "storage.file.read",
      [fileRef, { format: { kind: "uxp.storage.symbol", namespace: "formats", name: "binary" } }]
    ],
    ["uxp-api/modules/uxp", "storage.entry.getMetadata", [fileRef]],
    ["uxp-api/modules/uxp", "storage.localFileSystem.createPersistentToken", [fileRef]],
    ["uxp-api/modules/uxp", "storage.localFileSystem.getEntryForPersistentToken", ["persistent-token"]]
  ]);
});

test("WebView uxp.shell rejects file URLs before calling the bridge", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  let called = false;
  const uxp = createUxpNamespace({
    async call() {
      called = true;
      return "";
    }
  });

  await assert.rejects(
    uxp.shell.openExternal(" file:///tmp/example.txt"),
    /uxp\.shell\.openExternal does not allow file: URLs/
  );
  assert.equal(called, false);
});

function storageRef(type, id, entry) {
  return {
    kind: "uxp.storage.entry",
    type,
    id,
    entry: {
      isEntry: true,
      url: `${type}:/${entry.name}`,
      nativePath: `C:/${entry.name}`,
      ...entry
    }
  };
}

test("WebView uxp.userInfo serializes userId through the uxp module", async () => {
  const { createUxpNamespace } = await import("../../dist/webview/uxp-api/modules/uxp/index.js");
  const calls = [];
  const uxp = createUxpNamespace({
    async call(module, method, args) {
      calls.push([module, method, args]);
      return "user-123";
    }
  });

  assert.equal(await uxp.userInfo.userId(), "user-123");
  assert.deepEqual(calls, [["uxp-api/modules/uxp", "userInfo.userId", undefined]]);
});
