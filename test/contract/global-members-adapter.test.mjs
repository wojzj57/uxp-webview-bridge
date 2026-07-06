import assert from "node:assert/strict";
import { test } from "node:test";

function withGlobal(name, value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  });

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete globalThis[name];
      }
    });
}

test("UXP clipboard adapter dispatches to navigator.clipboard after validation", async () => {
  const { dispatchClipboardCall } = await import(
    "../../dist/uxp/uxp-api/global-members/clipboard/index.js"
  );
  const calls = [];

  await withGlobal(
    "navigator",
    {
      clipboard: {
        async write(data) {
          calls.push(["write", data]);
        },
        async writeText(text) {
          calls.push(["writeText", text]);
        },
        async read() {
          return { "text/plain": "hello" };
        },
        async readText() {
          return "hello";
        }
      }
    },
    async () => {
      await dispatchClipboardCall("write", [{ "text/plain": "hello" }]);
      await dispatchClipboardCall("writeText", ["hello"]);
      assert.deepEqual(await dispatchClipboardCall("read", []), { "text/plain": "hello" });
      assert.equal(await dispatchClipboardCall("readText", []), "hello");
    }
  );

  assert.deepEqual(calls, [
    ["write", { "text/plain": "hello" }],
    ["writeText", "hello"]
  ]);
});

test("UXP clipboard adapter rejects bad data before host access", async () => {
  const { dispatchClipboardCall } = await import(
    "../../dist/uxp/uxp-api/global-members/clipboard/index.js"
  );

  await assert.rejects(
    dispatchClipboardCall("write", [{ "text/plain": 1 }]),
    /clipboard\.write data must be a string MIME map/
  );
});

test("UXP storage adapters validate arguments and dispatch to globals", async () => {
  const { dispatchLocalStorageCall } = await import(
    "../../dist/uxp/uxp-api/global-members/local-storage/index.js"
  );
  const { dispatchSessionStorageCall } = await import(
    "../../dist/uxp/uxp-api/global-members/session-storage/index.js"
  );
  const values = new Map([["first", "value"]]);
  const storage = {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };

  await withGlobal("localStorage", storage, async () => {
    assert.equal(dispatchLocalStorageCall("length", []), 1);
    assert.equal(dispatchLocalStorageCall("key", [0]), "first");
    assert.equal(dispatchLocalStorageCall("getItem", ["first"]), "value");
    dispatchLocalStorageCall("setItem", ["second", "two"]);
    assert.equal(values.get("second"), "two");
    assert.throws(() => dispatchLocalStorageCall("key", [-1]), /non-negative integer/);
  });

  await withGlobal("sessionStorage", storage, async () => {
    assert.equal(dispatchSessionStorageCall("getItem", ["second"]), "two");
  });
});

test("UXP crypto adapter dispatches typed array transport to window.crypto", async () => {
  const { dispatchCryptoCall } = await import(
    "../../dist/uxp/uxp-api/global-members/crypto/index.js"
  );
  const { fsBytesToTransport, fsTransportToUint8Array } = await import(
    "../../dist/shared/uxp-api/fs-protocol.js"
  );

  await withGlobal(
    "crypto",
    {
      getRandomValues(array) {
        array.fill(7);
        return array;
      },
      randomUUID() {
        return "00000000-0000-4000-8000-000000000000";
      }
    },
    async () => {
      const result = dispatchCryptoCall("getRandomValues", [
        {
          kind: "Uint8Array",
          length: 3,
          bytes: fsBytesToTransport(new Uint8Array([1, 2, 3]))
        }
      ]);

      assert.equal(result.kind, "Uint8Array");
      assert.deepEqual(Array.from(fsTransportToUint8Array(result.bytes)), [7, 7, 7]);
      assert.equal(dispatchCryptoCall("randomUUID", []), "00000000-0000-4000-8000-000000000000");
    }
  );
});

test("UXP path adapter dispatches to window.path flavors", async () => {
  const { dispatchPathCall } = await import("../../dist/uxp/uxp-api/global-members/path/index.js");
  const posix = {
    sep: "/",
    delimiter: ":",
    normalize: (value) => value.replace("//", "/"),
    join: (...values) => values.join("/"),
    resolve: (...values) => `/${values.join("/")}`,
    isAbsolute: (value) => value.startsWith("/"),
    relative: (_from, to) => to,
    dirname: (value) => value.slice(0, value.lastIndexOf("/")) || ".",
    basename: (value, ext = "") => value.split("/").at(-1).replace(ext, ""),
    extname: (value) => {
      const base = value.split("/").at(-1);
      const dot = base.lastIndexOf(".");
      return dot > 0 ? base.slice(dot) : "";
    },
    parse: () => ({ root: "/", dir: "/tmp", base: "a.txt", ext: ".txt", name: "a" }),
    format: (value) => `${value.dir}/${value.base}`
  };

  await withGlobal("path", { ...posix, posix, win32: { ...posix, sep: "\\", delimiter: ";" } }, async () => {
    assert.equal(dispatchPathCall("posix.sep", []), "/");
    assert.equal(dispatchPathCall("posix.join", ["a", "b"]), "a/b");
    assert.equal(dispatchPathCall("win32.delimiter", []), ";");
    assert.deepEqual(dispatchPathCall("parse", ["/tmp/a.txt"]), {
      root: "/",
      dir: "/tmp",
      base: "a.txt",
      ext: ".txt",
      name: "a"
    });
    assert.throws(() => dispatchPathCall("format", [null]), /pathObject must be an object/);
  });
});
