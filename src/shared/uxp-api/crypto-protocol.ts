import type { FsBinaryTransportData } from "./fs-protocol.js";

export const CRYPTO_MODULE_ID = "uxp-api/global-members/crypto";

export const CRYPTO_METHOD_NAMES = ["getRandomValues", "randomUUID"] as const;

export type CryptoProtocolMethodName = (typeof CRYPTO_METHOD_NAMES)[number];

export const CRYPTO_INTEGER_TYPED_ARRAY_NAMES = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "BigInt64Array",
  "BigUint64Array"
] as const;

export type CryptoIntegerTypedArrayName = (typeof CRYPTO_INTEGER_TYPED_ARRAY_NAMES)[number];

export interface CryptoTypedArrayTransport {
  readonly kind: CryptoIntegerTypedArrayName;
  readonly length: number;
  readonly bytes: FsBinaryTransportData;
}

const CRYPTO_METHOD_SET = new Set<string>(CRYPTO_METHOD_NAMES);
const CRYPTO_INTEGER_TYPED_ARRAY_SET = new Set<string>(CRYPTO_INTEGER_TYPED_ARRAY_NAMES);

export function isCryptoProtocolMethodName(method: string): method is CryptoProtocolMethodName {
  return CRYPTO_METHOD_SET.has(method);
}

export function assertCryptoProtocolMethodName(
  method: string
): asserts method is CryptoProtocolMethodName {
  if (!isCryptoProtocolMethodName(method)) {
    throw new Error(`Unsupported crypto method: ${method}`);
  }
}

export function isCryptoIntegerTypedArrayName(
  value: string
): value is CryptoIntegerTypedArrayName {
  return CRYPTO_INTEGER_TYPED_ARRAY_SET.has(value);
}
