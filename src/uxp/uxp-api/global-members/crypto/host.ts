import {
  assertCryptoProtocolMethodName,
  CRYPTO_MODULE_ID,
  isCryptoIntegerTypedArrayName,
  type CryptoIntegerTypedArrayName,
  type CryptoTypedArrayTransport
} from "@shared/uxp-api/crypto-protocol.js";
import {
  bytesToTransport,
  isBinaryTransportData,
  transportToBytes
} from "@shared/uxp-api/binary-transport.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import type { CryptoHost, CryptoIntegerTypedArray } from "./types.js";

export const cryptoModuleAdapter: UxpModuleAdapter = {
  moduleId: CRYPTO_MODULE_ID,
  dispatch: dispatchCryptoCall
};

export function dispatchCryptoCall(method: string, args: readonly unknown[]): unknown {
  assertCryptoProtocolMethodName(method);

  if (method === "getRandomValues") {
    const [transport] = expectCryptoArgs<[unknown]>(args, 1, 1, "crypto.getRandomValues");
    const array = createTypedArrayFromTransport(transport);
    const value = getCryptoHost().getRandomValues(array);
    return serializeTypedArray(value);
  }

  expectCryptoArgs<[]>(args, 0, 0, "crypto.randomUUID");
  const value = getCryptoHost().randomUUID();
  if (typeof value !== "string") {
    throw new Error("crypto.randomUUID returned a non-string value.");
  }
  return value;
}

function getCryptoHost(): CryptoHost {
  const crypto = (globalThis as { crypto?: CryptoHost }).crypto;
  if (!crypto) {
    throw new Error("window.crypto is not available.");
  }
  return crypto;
}

function createTypedArrayFromTransport(value: unknown): CryptoIntegerTypedArray {
  if (!isCryptoTypedArrayTransport(value)) {
    throw new Error("crypto.getRandomValues array must be typed array transport data.");
  }

  const bytes = transportToBytes(value.bytes);
  const byteLength = value.length * bytesPerElement(value.kind);
  if (byteLength > 65_536) {
    throw new Error("crypto.getRandomValues array byteLength must not exceed 65,536.");
  }
  if (bytes.byteLength !== byteLength) {
    throw new Error("crypto.getRandomValues transport byteLength does not match typed array length.");
  }

  const buffer = new ArrayBuffer(byteLength);
  return createTypedArray(value.kind, buffer);
}

function serializeTypedArray(array: CryptoIntegerTypedArray): CryptoTypedArrayTransport {
  const kind = array.constructor.name;
  if (!isCryptoIntegerTypedArrayName(kind)) {
    throw new Error("crypto.getRandomValues returned unsupported typed array data.");
  }

  return {
    kind,
    length: array.length,
    bytes: bytesToTransport(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
  };
}

function isCryptoTypedArrayTransport(value: unknown): value is CryptoTypedArrayTransport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CryptoTypedArrayTransport>;
  return (
    typeof candidate.kind === "string" &&
    isCryptoIntegerTypedArrayName(candidate.kind) &&
    Number.isInteger(candidate.length) &&
    candidate.length !== undefined &&
    candidate.length >= 0 &&
    candidate.bytes !== undefined &&
    isBinaryTransportData(candidate.bytes)
  );
}

function bytesPerElement(kind: CryptoIntegerTypedArrayName): number {
  switch (kind) {
    case "Int8Array":
    case "Uint8Array":
    case "Uint8ClampedArray":
      return 1;
    case "Int16Array":
    case "Uint16Array":
      return 2;
    case "Int32Array":
    case "Uint32Array":
      return 4;
    case "BigInt64Array":
    case "BigUint64Array":
      return 8;
  }
}

function createTypedArray(
  kind: CryptoIntegerTypedArrayName,
  buffer: ArrayBuffer
): CryptoIntegerTypedArray {
  switch (kind) {
    case "Int8Array":
      return new Int8Array(buffer);
    case "Uint8Array":
      return new Uint8Array(buffer);
    case "Uint8ClampedArray":
      return new Uint8ClampedArray(buffer);
    case "Int16Array":
      return new Int16Array(buffer);
    case "Uint16Array":
      return new Uint16Array(buffer);
    case "Int32Array":
      return new Int32Array(buffer);
    case "Uint32Array":
      return new Uint32Array(buffer);
    case "BigInt64Array":
      return new BigInt64Array(buffer);
    case "BigUint64Array":
      return new BigUint64Array(buffer);
  }
}

function expectCryptoArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  label: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    const count = minLength === maxLength ? minLength : `${minLength}-${maxLength}`;
    throw new Error(`${label} requires ${count} argument${count === 1 ? "" : "s"}.`);
  }
  return args as unknown as T;
}
