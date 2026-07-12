import assert from "node:assert/strict";
import { test } from "node:test";

// The shared binary transport layer (ADR 0011 / RFC-0010 Part 1) is the single copy of the
// { kind:"bytes", encoding, value } envelope + base64 codec + inline threshold that fs, crypto,
// fetch, and imaging all consume. These tests pin its round-trip behavior — small buffers ride
// inline as an array, large buffers switch to base64, and both decode back to the exact bytes.
const module = "../../dist/shared/uxp-api/binary-transport.js";

test("bytesToTransport uses an inline array for small buffers", async () => {
  const { bytesToTransport, BINARY_INLINE_BYTES_LIMIT } = await import(module);

  const small = new Uint8Array([0, 1, 2, 254, 255]);
  const transport = bytesToTransport(small);

  assert.equal(transport.kind, "bytes");
  assert.equal(transport.encoding, "array");
  assert.deepEqual(transport.value, [0, 1, 2, 254, 255]);
  assert.ok(small.byteLength <= BINARY_INLINE_BYTES_LIMIT);
});

test("bytesToTransport switches to base64 above the inline threshold", async () => {
  const { bytesToTransport, transportToBytes, BINARY_INLINE_BYTES_LIMIT } = await import(module);

  const large = new Uint8Array(BINARY_INLINE_BYTES_LIMIT + 1);
  for (let index = 0; index < large.byteLength; index += 1) {
    large[index] = index % 256;
  }

  const transport = bytesToTransport(large);
  assert.equal(transport.encoding, "base64");
  assert.equal(typeof transport.value, "string");

  const round = transportToBytes(transport);
  assert.equal(round.byteLength, large.byteLength);
  assert.deepEqual(Array.from(round), Array.from(large));
});

test("empty buffers round-trip", async () => {
  const { bytesToTransport, transportToBytes } = await import(module);

  const empty = new Uint8Array(0);
  const transport = bytesToTransport(empty);
  assert.equal(transport.encoding, "array");
  assert.deepEqual(transport.value, []);
  assert.equal(transportToBytes(transport).byteLength, 0);
});

test("base64 padding is decoded correctly for every remainder", async () => {
  const { bytesToTransport, transportToBytes, BINARY_INLINE_BYTES_LIMIT } = await import(module);

  // Force base64 while varying length mod 3 to exercise 0/1/2 padding chars.
  for (const extra of [0, 1, 2]) {
    const length = BINARY_INLINE_BYTES_LIMIT + 1 + extra;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = (index * 7 + 3) % 256;
    }

    const transport = bytesToTransport(bytes);
    assert.equal(transport.encoding, "base64");
    const decoded = transportToBytes(transport);
    assert.deepEqual(Array.from(decoded), Array.from(bytes), `remainder ${extra}`);
  }
});

test("transportToArrayBuffer produces a detached copy of the bytes", async () => {
  const { bytesToTransport, transportToArrayBuffer } = await import(module);

  const source = new Uint8Array([10, 20, 30, 40]);
  const buffer = await import(module).then(() =>
    transportToArrayBuffer(bytesToTransport(source))
  );

  assert.ok(buffer instanceof ArrayBuffer);
  assert.deepEqual(Array.from(new Uint8Array(buffer)), [10, 20, 30, 40]);
});

test("valueToTransport accepts ArrayBuffer and views without copying wrong offsets", async () => {
  const { valueToTransport, transportToBytes } = await import(module);

  const backing = new Uint8Array([9, 8, 7, 6, 5]);
  const view = new Uint8Array(backing.buffer, 1, 3); // [8,7,6]

  assert.deepEqual(Array.from(transportToBytes(valueToTransport(view))), [8, 7, 6]);
  assert.deepEqual(
    Array.from(transportToBytes(valueToTransport(backing.buffer))),
    [9, 8, 7, 6, 5]
  );
});

test("isBinaryTransportData validates envelope shape", async () => {
  const { isBinaryTransportData } = await import(module);

  assert.equal(isBinaryTransportData({ kind: "bytes", encoding: "array", value: [1, 2] }), true);
  assert.equal(isBinaryTransportData({ kind: "bytes", encoding: "base64", value: "AAAA" }), true);
  assert.equal(isBinaryTransportData({ kind: "text", value: "hi" }), false);
  assert.equal(isBinaryTransportData({ kind: "bytes", encoding: "array", value: [256] }), false);
  assert.equal(isBinaryTransportData({ kind: "bytes", encoding: "base64", value: 5 }), false);
  assert.equal(isBinaryTransportData(null), false);
});
