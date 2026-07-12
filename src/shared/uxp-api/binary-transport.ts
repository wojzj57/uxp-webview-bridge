/**
 * Runtime-neutral binary transport layer.
 *
 * Binary payloads cross the bridge as a transport-safe envelope rather than
 * relying on `postMessage` transferables (forbidden by AGENTS.md). Small
 * buffers ride inline as a plain number array; larger buffers are base64
 * encoded to keep the JSON compact. This is the single copy of the envelope,
 * codec, threshold, and coercion helpers — fs, crypto, fetch, and imaging all
 * consume it (ADR 0011).
 */

/** A binary payload serialized for transport across the bridge. */
export interface BinaryTransportData {
  readonly kind: "bytes";
  readonly encoding: "array" | "base64";
  readonly value: readonly number[] | string;
}

/**
 * Buffers at or below this many bytes ride inline as a number array; larger
 * buffers are base64 encoded. Shared by every module that moves binary.
 */
export const BINARY_INLINE_BYTES_LIMIT = 32 * 1024;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode raw bytes into a transport envelope, choosing array vs base64 by size. */
export function bytesToTransport(bytes: Uint8Array): BinaryTransportData {
  if (bytes.byteLength <= BINARY_INLINE_BYTES_LIMIT) {
    return {
      kind: "bytes",
      encoding: "array",
      value: Array.from(bytes)
    };
  }

  return {
    kind: "bytes",
    encoding: "base64",
    value: bytesToBase64(bytes)
  };
}

/**
 * Coerce any accepted binary-ish value into a transport envelope. Strings are
 * out of scope here (callers that also accept text keep their own text case);
 * this generalizes the byte side of the old `fsValueToTransport`.
 */
export function valueToTransport(value: ArrayBuffer | ArrayBufferView): BinaryTransportData {
  if (ArrayBuffer.isView(value)) {
    return bytesToTransport(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }

  return bytesToTransport(new Uint8Array(value));
}

/** Decode a transport envelope back into raw bytes. */
export function transportToBytes(value: BinaryTransportData): Uint8Array {
  if (value.encoding === "array") {
    if (!Array.isArray(value.value)) {
      throw new Error("Invalid binary transport data.");
    }
    return Uint8Array.from(value.value);
  }

  if (typeof value.value !== "string") {
    throw new Error("Invalid binary transport data.");
  }
  return base64ToBytes(value.value);
}

/** Decode a transport envelope into a fresh `ArrayBuffer`. */
export function transportToArrayBuffer(value: BinaryTransportData): ArrayBuffer {
  const bytes = transportToBytes(value);
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

/** Type guard for a well-formed binary transport envelope. */
export function isBinaryTransportData(value: unknown): value is BinaryTransportData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BinaryTransportData>;
  if (candidate.kind !== "bytes") {
    return false;
  }

  if (candidate.encoding === "array") {
    return (
      Array.isArray(candidate.value) &&
      candidate.value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    );
  }

  return candidate.encoding === "base64" && typeof candidate.value === "string";
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  let index = 0;

  while (index < bytes.byteLength) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.byteLength ? bytes[index++] : undefined;
    const third = index < bytes.byteLength ? bytes[index++] : undefined;
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += BASE64_ALPHABET[(triplet >> 18) & 63];
    output += BASE64_ALPHABET[(triplet >> 12) & 63];
    output += second === undefined ? "=" : BASE64_ALPHABET[(triplet >> 6) & 63];
    output += third === undefined ? "=" : BASE64_ALPHABET[triplet & 63];
  }

  return output;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid binary transport data.");
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((normalized.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const first = decodeBase64Char(normalized[index]);
    const second = decodeBase64Char(normalized[index + 1]);
    const third = normalized[index + 2] === "=" ? 0 : decodeBase64Char(normalized[index + 2]);
    const fourth = normalized[index + 3] === "=" ? 0 : decodeBase64Char(normalized[index + 3]);
    const triplet = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 16) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 8) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = triplet & 255;
    }
  }

  return output;
}

function decodeBase64Char(char: string | undefined): number {
  if (!char) {
    throw new Error("Invalid binary transport data.");
  }

  const value = BASE64_ALPHABET.indexOf(char);
  if (value === -1) {
    throw new Error("Invalid binary transport data.");
  }
  return value;
}
