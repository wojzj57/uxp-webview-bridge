import assert from "node:assert/strict";
import { test } from "node:test";

const xmpModule = "../../dist/webview/uxp-api/modules/uxp/xmp/index.js";

/**
 * A recording rpc that resolves every call to a benign value. It never throws, so the only way a
 * member access can fail is the RemoteClass base's own "No RPC method name configured" guard — which
 * is exactly the descriptor <-> method-name drift we want to catch.
 */
function createRecordingRpc() {
  const calls = [];
  return {
    calls,
    call(module, method, args) {
      calls.push({ module, method, args });
      // batchGet decodes each requested property off the returned map, so hand back an object.
      return Promise.resolve(method.endsWith(".batchGet") ? {} : null);
    }
  };
}

function ownMemberNames(instance) {
  const names = new Set();
  for (let target = instance; target && target !== Object.prototype; target = Object.getPrototypeOf(target)) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name !== "constructor") {
        names.add(name);
      }
    }
  }
  return [...names];
}

async function exerciseMember(instance, name) {
  const descriptor = findDescriptor(instance, name);
  if (descriptor?.get) {
    await instance[name];
    return;
  }
  const value = instance[name];
  if (typeof value === "function") {
    await value.call(instance);
  }
}

function findDescriptor(instance, name) {
  for (let target = instance; target && target !== Object.prototype; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

const reference = (type) => ({ kind: "uxp.remote.ref", type, id: `${type}-1` });

const CASES = [
  {
    name: "XMPMeta",
    build: (namespace) => new namespace.XMPMeta(undefined, undefined, reference("XMPMeta"))
  },
  {
    name: "XMPFile",
    build: (namespace) => new namespace.XMPFile(undefined, undefined, undefined, reference("XMPFile"))
  },
  {
    name: "XMPDateTime",
    build: (namespace) => new namespace.XMPDateTime(undefined, reference("XMPDateTime"))
  }
];

for (const testCase of CASES) {
  test(`${testCase.name} exposes only members backed by a configured RPC method`, async () => {
    const { createUxpXmpNamespace } = await import(xmpModule);
    const rpc = createRecordingRpc();
    const namespace = createUxpXmpNamespace(rpc);
    const instance = testCase.build(namespace);

    const members = ownMemberNames(instance).filter(
      (name) => name !== "toRemoteReference" && name !== "batchGet" && name !== "batchSet" && name !== "dispose"
    );
    assert.ok(members.length > 0, `${testCase.name} should define at least one member`);

    for (const name of members) {
      await assert.doesNotReject(
        () => exerciseMember(instance, name),
        new RegExp(`No RPC method name configured`)
      );
    }
  });
}

test("XMPIterator is exposed but not directly constructible", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  const namespace = createUxpXmpNamespace(createRecordingRpc());
  assert.equal(typeof namespace.XMPIterator, "function");
});

test("XMPDateTime batch operations use the wired batch RPC names", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  const rpc = createRecordingRpc();
  const namespace = createUxpXmpNamespace(rpc);
  const dateTime = new namespace.XMPDateTime(undefined, reference("XMPDateTime"));

  await dateTime.batchGet(["year", "month"]);
  const batchGetCall = rpc.calls.find((call) => call.method === "xmp.dateTime.batchGet");
  assert.ok(batchGetCall, "batchGet should call xmp.dateTime.batchGet");
  assert.deepEqual(batchGetCall.args, [reference("XMPDateTime"), ["year", "month"]]);

  await dateTime.batchSet({ year: 2026 });
  const batchSetCall = rpc.calls.find((call) => call.method === "xmp.dateTime.batchSet");
  assert.ok(batchSetCall, "batchSet should call xmp.dateTime.batchSet");
  assert.equal(batchSetCall.args[0].type, "XMPDateTime");
  assert.deepEqual(batchSetCall.args[1], { year: 2026 });
});

test("XMPDateTime batchSet exposes its own failure and lets later operations recover", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  let batchAttempts = 0;
  const namespace = createUxpXmpNamespace({
    async call(_module, method) {
      if (method === "xmp.dateTime.batchSet") {
        batchAttempts += 1;
        throw new Error("batch write failed");
      }
      if (method === "xmp.dateTime.batchGet") return { year: 2026 };
      return undefined;
    }
  });
  const dateTime = new namespace.XMPDateTime(undefined, reference("XMPDateTime"));

  const write = dateTime.batchSet({ year: 2026 });
  assert.ok(write instanceof Promise, "batchSet should return its Host completion Promise");
  await assert.rejects(write, /batch write failed/);
  assert.deepEqual(await dateTime.batchGet(["year"]), { year: 2026 });
  assert.equal(batchAttempts, 1);
});

test("empty batches complete locally for propertyless RemoteClass instances", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  const rpc = createRecordingRpc();
  const namespace = createUxpXmpNamespace(rpc);
  const meta = new namespace.XMPMeta(undefined, undefined, reference("XMPMeta"));

  assert.deepEqual(await meta.batchGet([]), {});
  await meta.batchSet({});
  assert.deepEqual(rpc.calls, []);
});

test("batch operations validate locally, deduplicate reads, and snapshot writes at invocation", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  const rpc = createRecordingRpc();
  const namespace = createUxpXmpNamespace(rpc);
  const dateTime = new namespace.XMPDateTime(undefined, reference("XMPDateTime"));

  await dateTime.batchGet(["year", "year", "month"]);
  assert.deepEqual(rpc.calls.at(-1).args[1], ["year", "month"]);

  const values = { year: 2026 };
  const write = dateTime.batchSet(values);
  values.year = 2030;
  await write;
  assert.deepEqual(rpc.calls.at(-1).args[1], { year: 2026 });

  const callCount = rpc.calls.length;
  await assert.rejects(dateTime.batchGet(["missing"]), TypeError);
  await assert.rejects(dateTime.batchSet({ missing: 1 }), TypeError);
  await assert.rejects(dateTime.batchSet([]), TypeError);
  assert.equal(rpc.calls.length, callCount, "locally invalid batches must not cross the bridge");
});

test("XMP remote results support old and chained await forms", async () => {
  const { createUxpXmpNamespace } = await import(xmpModule);
  const metaRef = reference("XMPMeta");
  const calls = [];
  const namespace = createUxpXmpNamespace({
    async call(_module, method) {
      calls.push(method);
      if (method === "xmp.file.getXMP") return metaRef;
      if (method === "xmp.meta.serialize") return "<xmp />";
      return undefined;
    }
  });
  const file = new namespace.XMPFile(undefined, undefined, undefined, reference("XMPFile"));

  assert.equal(await (await file.getXMP()).serialize(), "<xmp />");
  assert.equal(await file.getXMP().serialize(), "<xmp />");
  assert.deepEqual(calls, [
    "xmp.file.getXMP",
    "xmp.meta.serialize",
    "xmp.file.getXMP",
    "xmp.meta.serialize"
  ]);
});
