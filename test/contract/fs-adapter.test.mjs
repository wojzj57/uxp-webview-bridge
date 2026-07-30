import assert from "node:assert/strict";
import { test } from "node:test";

const baseCapabilities = new Set();

test("UXP fs adapter rejects unsupported methods before requiring fs", async () => {
  const { dispatchFsCall } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(dispatchFsCall("notARealMethod", []), /Unsupported fs method: notARealMethod/);
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP fs adapter rejects invalid arguments before requiring fs", async () => {
  const { dispatchFsCall } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };

  try {
    await assert.rejects(dispatchFsCall("readFile", [123]), /fs\.readFile path must be a non-empty string/);
    assert.equal(required, false);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP fs adapter serializes readFile binary results and writeFile binary input", async () => {
  const { dispatchFsCall } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const originalRequire = globalThis.require;
  const writes = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "fs");
    return {
      async readFile(path, options) {
        assert.equal(path, "plugin-temp:/data.bin");
        assert.deepEqual(options, {});
        return new Uint8Array([1, 2, 3]).buffer;
      },
      async writeFile(path, data, options) {
        writes.push([path, Array.from(new Uint8Array(data)), options]);
        return 3;
      }
    };
  };

  try {
    assert.deepEqual(await dispatchFsCall("readFile", ["plugin-temp:/data.bin"]), {
      kind: "bytes",
      encoding: "array",
      value: [1, 2, 3]
    });
    assert.equal(
      await dispatchFsCall("writeFile", [
        "plugin-temp:/data.bin",
        { kind: "bytes", encoding: "array", value: [4, 5, 6] },
        { flag: "w" }
      ]),
      3
    );
    assert.deepEqual(writes, [["plugin-temp:/data.bin", [4, 5, 6], { flag: "w" }]]);
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP fs adapter owns opened file descriptors", async () => {
  const { dispatchFsCall, fsModuleAdapter } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const originalRequire = globalThis.require;
  const calls = [];

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "fs");
    return {
      async open(path, flag, mode) {
        calls.push(["open", path, flag, mode]);
        return 42;
      },
      async read(fd, buffer, offset, length, position) {
        calls.push(["read", fd, offset, length, position]);
        new Uint8Array(buffer).set([9, 8, 7]);
        return { bytesRead: 3, buffer };
      },
      async close(fd) {
        calls.push(["close", fd]);
        return 0;
      }
    };
  };

  try {
    assert.equal(await dispatchFsCall("open", ["plugin-temp:/data.bin", "r"]), 42);
    assert.deepEqual(await dispatchFsCall("read", [
      42,
      { kind: "bytes", encoding: "array", value: [0, 0, 0] },
      0,
      3,
      0
    ]), {
      bytesRead: 3,
      buffer: { kind: "bytes", encoding: "array", value: [9, 8, 7] }
    });
    assert.equal(await dispatchFsCall("close", [42]), 0);
    await assert.rejects(
      dispatchFsCall("read", [42, { kind: "bytes", encoding: "array", value: [0] }, 0, 1, 0]),
      /fs\.read fd is not an open fs file descriptor owned by this bridge/
    );
    assert.deepEqual(calls, [
      ["open", "plugin-temp:/data.bin", "r", undefined],
      ["read", 42, 0, 3, 0],
      ["close", 42]
    ]);
  } finally {
    fsModuleAdapter.destroy?.();
    restoreRequire(originalRequire);
  }
});

test("UXP fs adapter serializes lstat results", async () => {
  const { dispatchFsCall } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const originalRequire = globalThis.require;

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "fs");
    return {
      async lstat(path) {
        assert.equal(path, "plugin-temp:/data.bin");
        return {
          size: 10,
          mode: 0o666,
          atime: new Date(1000),
          mtime: new Date(2000),
          ctime: new Date(3000),
          birthtime: new Date(4000),
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false
        };
      }
    };
  };

  try {
    assert.deepEqual(await dispatchFsCall("lstat", ["plugin-temp:/data.bin"]), {
      size: 10,
      mode: 0o666,
      atimeMs: 1000,
      mtimeMs: 2000,
      ctimeMs: 3000,
      birthtimeMs: 4000,
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false
    });
  } finally {
    restoreRequire(originalRequire);
  }
});

test("UXP module registry gates fs before requiring fs", async () => {
  const { createUxpModuleRegistry } = await import("../../dist/uxp/module-registry.js");
  const { fsModuleAdapter } = await import("../../dist/uxp/uxp-api/modules/fs/index.js");
  const { FS_MODULE_ID } = await import("../../dist/shared/uxp-api/fs-protocol.js");
  const originalRequire = globalThis.require;
  let required = false;
  globalThis.require = () => {
    required = true;
    return {};
  };
  const registry = createUxpModuleRegistry(baseCapabilities, [fsModuleAdapter]);

  try {
    assert.throws(
      () => registry.dispatch({ module: FS_MODULE_ID, method: "missing", args: ["private"] }),
      /Unsupported fs method: missing/
    );
    assert.throws(
      () => registry.dispatch({ module: FS_MODULE_ID, method: "readFile", args: ["plugin-temp:/x"] }),
      /Bridge capability fs denied operation/
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
