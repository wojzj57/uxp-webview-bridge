import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView path global exposes POSIX path operations without bridge configuration", async () => {
  const { createPathNamespace } = await import("../../dist/webview/uxp-api/global-members/path/index.js");
  const calls = [];
  const path = createPathNamespace({
    call(module, method, args) {
      calls.push({ module, method, args });
      if (method === "posix.join") {
        return Promise.resolve("plugin:/index.html");
      }
      if (method === "posix.basename") {
        return Promise.resolve("example");
      }
      return Promise.resolve({
        root: "/",
        dir: "/tmp",
        base: "example.txt",
        ext: ".txt",
        name: "example"
      });
    }
  });

  assert.equal(await path.posix.join("plugin:", "assets", "..", "index.html"), "plugin:/index.html");
  assert.equal(await path.posix.basename("/tmp/example.txt", ".txt"), "example");
  assert.deepEqual(await path.posix.parse("/tmp/example.txt"), {
    root: "/",
    dir: "/tmp",
    base: "example.txt",
    ext: ".txt",
    name: "example"
  });
  assert.deepEqual(calls, [
    {
      module: "uxp-api/global-members/path",
      method: "posix.join",
      args: ["plugin:", "assets", "..", "index.html"]
    },
    {
      module: "uxp-api/global-members/path",
      method: "posix.basename",
      args: ["/tmp/example.txt", ".txt"]
    },
    {
      module: "uxp-api/global-members/path",
      method: "posix.parse",
      args: ["/tmp/example.txt"]
    }
  ]);
});

test("WebView path global exposes Windows-specific operations", async () => {
  const { createPathNamespace } = await import("../../dist/webview/uxp-api/global-members/path/index.js");
  const path = createPathNamespace({
    call(_module, method) {
      if (method === "win32.sep") {
        return Promise.resolve("\\");
      }
      if (method === "win32.join") {
        return Promise.resolve("C:\\Users\\file.txt");
      }
      return Promise.resolve(true);
    }
  });

  assert.equal(await path.win32.sep, "\\");
  assert.equal(await path.win32.join("C:\\Users", "Plugin", "..", "file.txt"), "C:\\Users\\file.txt");
  assert.equal(await path.win32.isAbsolute("C:\\Users\\file.txt"), true);
});
