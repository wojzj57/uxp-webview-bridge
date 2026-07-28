import assert from "node:assert/strict";
import { test } from "node:test";

const handleRegistryModule = "../../dist/uxp/uxp-api/remote/index.js";
const referenceModule = "../../dist/webview/uxp-api/remote/reference.js";
const identityCacheModule = "../../dist/webview/uxp-api/remote/identity-cache.js";

test("remote handle registry allocates references, resolves, and disposes", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  const registry = createRemoteHandleRegistry();

  const value = { id: "layer-1" };
  const reference = registry.register("Layer", value);
  assert.equal(reference.kind, "uxp.remote.ref");
  assert.equal(reference.type, "Layer");
  assert.equal(typeof reference.id, "string");

  assert.equal(registry.resolve(reference, "Layer"), value);

  registry.dispose(reference);
  assert.throws(() => registry.resolve(reference, "Layer"), /Unknown Layer reference/);
});

test("remote handle registry rejects a type mismatch on resolve", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  const registry = createRemoteHandleRegistry();

  const reference = registry.register("Document", {});
  assert.throws(() => registry.resolve(reference, "Layer"), /Invalid Layer reference/);
});

test("remote handle registry dedups by key via getOrCreate", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  const registry = createRemoteHandleRegistry();

  let calls = 0;
  const factory = () => {
    calls += 1;
    return { seq: calls };
  };

  const first = registry.getOrCreate("Document", "doc-7", factory);
  const second = registry.getOrCreate("Document", "doc-7", factory);
  assert.equal(first.id, second.id);
  assert.equal(calls, 1);
  assert.deepEqual(registry.resolve(first, "Document"), { seq: 1 });

  const other = registry.getOrCreate("Document", "doc-8", factory);
  assert.notEqual(other.id, first.id);
  assert.equal(calls, 2);
});

test("remote handle registry keeps type key spaces isolated in getOrCreate", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  const registry = createRemoteHandleRegistry();

  const layer = registry.getOrCreate("Layer", "1", () => "layer");
  const document = registry.getOrCreate("Document", "1", () => "document");
  assert.notEqual(layer.id, document.id);
  assert.equal(registry.resolve(layer, "Layer"), "layer");
  assert.equal(registry.resolve(document, "Document"), "document");
});

test("remote handle registry prunes handles past the TTL and clears all", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  let clock = 1000;
  const registry = createRemoteHandleRegistry({ ttlMs: 100, now: () => clock });

  const reference = registry.register("Layer", {});
  clock = 1050;
  registry.prune();
  assert.doesNotThrow(() => registry.resolve(reference, "Layer"));

  clock = 1050 + 200;
  registry.prune();
  assert.throws(() => registry.resolve(reference, "Layer"), /Unknown Layer reference/);

  const fresh = registry.register("Layer", {});
  registry.clear();
  assert.throws(() => registry.resolve(fresh, "Layer"), /Unknown Layer reference/);
});

test("resolve refreshes a handle's TTL so active handles survive prune", async () => {
  const { createRemoteHandleRegistry } = await import(handleRegistryModule);
  let clock = 0;
  const registry = createRemoteHandleRegistry({ ttlMs: 100, now: () => clock });

  const reference = registry.register("Layer", "value");
  clock = 90;
  assert.equal(registry.resolve(reference, "Layer"), "value");
  clock = 150;
  registry.prune();
  assert.equal(registry.resolve(reference, "Layer"), "value");
});

test("encodeRemoteArgs turns reference holders into envelopes and trims trailing undefined", async () => {
  const { encodeRemoteArgs } = await import(referenceModule);

  const holder = {
    toRemoteReference: async () => ({ kind: "uxp.remote.ref", type: "XMPMeta", id: "meta-1" })
  };

  const encoded = await encodeRemoteArgs([holder, "keep", undefined, undefined]);
  assert.deepEqual(encoded, [{ kind: "uxp.remote.ref", type: "XMPMeta", id: "meta-1" }, "keep"]);
});

test("encodeRemoteArgs lets domain encoders map values and walks nested structures", async () => {
  const { encodeRemoteArgs } = await import(referenceModule);

  const dateEncoder = (value) =>
    value instanceof Date ? { kind: "uxp.xmp.nativeDate", iso: value.toISOString() } : undefined;

  const iso = "2026-07-07T00:00:00.000Z";
  const encoded = await encodeRemoteArgs([{ when: new Date(iso), tags: [new Date(iso)] }], [dateEncoder]);
  assert.deepEqual(encoded, [
    {
      when: { kind: "uxp.xmp.nativeDate", iso },
      tags: [{ kind: "uxp.xmp.nativeDate", iso }]
    }
  ]);
});

test("encodeRemoteArgs snapshots nested data returned by a synchronous encoder", async () => {
  const { encodeRemoteArgs } = await import(referenceModule);
  const source = { nested: { value: 1 } };
  const encoder = (value) => value === source ? { kind: "custom", data: value.nested } : undefined;

  const pending = encodeRemoteArgs([source], [encoder]);
  source.nested.value = 2;

  assert.deepEqual(await pending, [{ kind: "custom", data: { value: 1 } }]);
});

test("decodeRemoteValue applies the first decoder that accepts the value", async () => {
  const { decodeRemoteValue } = await import(referenceModule);

  const decline = () => undefined;
  const accept = (value) => (value === "raw" ? "decoded" : undefined);

  assert.equal(decodeRemoteValue("raw", [decline, accept]), "decoded");
  assert.equal(decodeRemoteValue("other", [decline, accept]), "other");
});

test("identity cache returns the same instance for a reference id until it is collected", async () => {
  const { createIdentityCache } = await import(identityCacheModule);
  const cache = createIdentityCache();

  let built = 0;
  const factory = () => {
    built += 1;
    return { tag: built };
  };

  const first = cache.getOrCreate("meta-1", factory);
  const second = cache.getOrCreate("meta-1", factory);
  assert.equal(first, second);
  assert.equal(built, 1);

  const other = cache.getOrCreate("meta-2", factory);
  assert.notEqual(other, first);
  assert.equal(built, 2);
});
