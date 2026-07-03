import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView path global exposes POSIX path operations without bridge configuration", async () => {
  const { path } = await import("../../dist/webview/index.js");

  assert.equal(path.posix.join("plugin:", "assets", "..", "index.html"), "plugin:/index.html");
  assert.equal(path.posix.basename("/tmp/example.txt", ".txt"), "example");
  assert.deepEqual(path.posix.parse("/tmp/example.txt"), {
    root: "/",
    dir: "/tmp",
    base: "example.txt",
    ext: ".txt",
    name: "example"
  });
});

test("WebView path global exposes Windows-specific operations", async () => {
  const { path } = await import("../../dist/webview/index.js");

  assert.equal(path.win32.sep, "\\");
  assert.equal(path.win32.join("C:\\Users", "Plugin", "..", "file.txt"), "C:\\Users\\file.txt");
  assert.equal(path.win32.isAbsolute("C:\\Users\\file.txt"), true);
});
