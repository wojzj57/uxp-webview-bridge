import {
  CRYPTO_MODULE_ID,
  isCryptoIntegerTypedArrayName,
  type CryptoIntegerTypedArrayName,
  type CryptoTypedArrayTransport
} from "@shared/uxp-api/crypto-protocol.js";
import {
  bytesToTransport,
  transportToBytes
} from "@shared/uxp-api/binary-transport.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { CryptoIntegerTypedArray, CryptoNamespace } from "./types.js";

interface CryptoRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createCryptoNamespace(rpc: CryptoRpc): CryptoNamespace {
  return {
    async getRandomValues<TArray extends CryptoIntegerTypedArray>(array: TArray): Promise<TArray> {
      const request = serializeTypedArray(array);
      const response = await rpc.call<CryptoTypedArrayTransport>(
        CRYPTO_MODULE_ID,
        "getRandomValues",
        [request]
      );
      return deserializeTypedArray(response) as TArray;
    },
    randomUUID: () => rpc.call<string>(CRYPTO_MODULE_ID, "randomUUID")
  };
}

export const crypto: CryptoNamespace = createCryptoNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

function serializeTypedArray(array: CryptoIntegerTypedArray): CryptoTypedArrayTransport {
  if (!ArrayBuffer.isView(array) || array instanceof DataView) {
    throw new Error("crypto.getRandomValues array must be an integer TypedArray.");
  }

  const kind = array.constructor.name;
  if (!isCryptoIntegerTypedArrayName(kind)) {
    throw new Error("crypto.getRandomValues array must be an integer TypedArray.");
  }

  if (array.byteLength > 65_536) {
    throw new Error("crypto.getRandomValues array byteLength must not exceed 65,536.");
  }

  return {
    kind,
    length: array.length,
    bytes: bytesToTransport(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
  };
}

function deserializeTypedArray(transport: CryptoTypedArrayTransport): CryptoIntegerTypedArray {
  const bytes = transportToBytes(transport.bytes);
  if (bytes.byteLength !== transport.length * bytesPerElement(transport.kind)) {
    throw new Error("crypto.getRandomValues returned invalid typed array data.");
  }
  const buffer = bytesToArrayBuffer(bytes);

  switch (transport.kind) {
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

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
