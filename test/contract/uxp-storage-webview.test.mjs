import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView UXP storage exposes persistent-file-storage constants locally", async () => {
  const { uxp } = await import("../../dist/webview/index.js");

  assert.equal(typeof uxp.storage.domains.userDocuments, "symbol");
  assert.equal(typeof uxp.storage.formats.binary, "symbol");
  assert.equal(typeof uxp.storage.modes.readWrite, "symbol");
  assert.equal(typeof uxp.storage.types.folder, "symbol");
  assert.deepEqual(uxp.storage.fileTypes.all, [".*"]);
  assert.ok(uxp.storage.fileTypes.images.includes("png"));
  assert.ok(uxp.storage.fileTypes.text.includes("txt"));

  assert.ok(uxp.storage.errors.PermissionDeniedError instanceof Error);
  assert.equal(uxp.storage.errors.PermissionDeniedError.name, "PermissionDeniedError");
});

test("WebView UXP storage exposes localFileSystem as an explicitly unsupported provider", async () => {
  const { uxp } = await import("../../dist/webview/index.js");
  const localFileSystem = uxp.storage.localFileSystem;
  const unsupported =
    /uxp\.storage\.localFileSystem is not supported by uxp-webview-bridge.*Use the fs namespace/;

  assert.equal(localFileSystem.isFileSystemProvider, true);
  assert.deepEqual(localFileSystem.supportedDomains, []);
  assert.equal(typeof localFileSystem.getFileForOpening, "function");
  assert.equal(typeof localFileSystem.getPluginFolder, "function");
  assert.equal(typeof localFileSystem.createSessionToken, "function");

  await assert.rejects(localFileSystem.getFileForOpening(), unsupported);
  await assert.rejects(localFileSystem.getPluginFolder(), unsupported);
  assert.throws(() => localFileSystem.createSessionToken({}), unsupported);
});
