import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView public API exposes fs namespace", async () => {
  const { fs } = await import("../../dist/webview/index.js");

  for (const name of [
    "readFile",
    "writeFile",
    "open",
    "close",
    "read",
    "write",
    "lstat",
    "rename",
    "copyFile",
    "unlink",
    "mkdir",
    "rmdir",
    "readdir"
  ]) {
    assert.equal(typeof fs[name], "function", `fs.${name} must be available`);
  }
});

test("WebView fs.read copies returned bytes into the caller buffer", async () => {
  const { createFsNamespace } = await import("../../dist/webview/uxp-api/modules/fs/index.js");
  const fs = createFsNamespace({
    async call(module, method, args) {
      assert.equal(module, "uxp-api/modules/fs");
      assert.equal(method, "read");
      assert.deepEqual(args[1], { kind: "bytes", encoding: "array", value: [0, 0, 0] });
      return {
        bytesRead: 3,
        buffer: { kind: "bytes", encoding: "array", value: [4, 5, 6] }
      };
    }
  });
  const buffer = new ArrayBuffer(3);

  const result = await fs.read(7, buffer, 0, 3, 0);

  assert.equal(result.buffer, buffer);
  assert.equal(result.bytesRead, 3);
  assert.deepEqual(Array.from(new Uint8Array(buffer)), [4, 5, 6]);
});

test("WebView fs.lstat restores stats methods and date fields", async () => {
  const { createFsNamespace } = await import("../../dist/webview/uxp-api/modules/fs/index.js");
  const fs = createFsNamespace({
    async call() {
      return {
        size: 12,
        mode: 0o666,
        atimeMs: 1000,
        mtimeMs: 2000,
        ctimeMs: 3000,
        birthtimeMs: 4000,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false
      };
    }
  });

  const stats = await fs.lstat("plugin-temp:/file.txt");

  assert.equal(stats.size, 12);
  assert.equal(stats.isFile(), true);
  assert.equal(stats.isDirectory(), false);
  assert.equal(stats.mtime?.getTime(), 2000);
});
