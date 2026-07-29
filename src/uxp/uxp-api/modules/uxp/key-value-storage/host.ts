import {
  fsBytesToTransport,
  fsTransportToHostValue,
  isFsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import type { UxpKeyValueStorageHostModule, UxpKeyValueStorageMethodName } from "./types.js";

declare const require: (moduleName: "uxp") => UxpKeyValueStorageHostModule;

export function dispatchUxpKeyValueStorageCall(
  method: UxpKeyValueStorageMethodName,
  args: readonly unknown[]
): unknown {
  switch (method) {
    case "storage.secureStorage.length":
      expectArgs(args, 0, 0, "uxp.storage.secureStorage.length");
      return getSecureStorage().length;
    case "storage.secureStorage.setItem":
      return dispatchSetItem(args);
    case "storage.secureStorage.getItem":
      return dispatchGetItem(args);
    case "storage.secureStorage.removeItem":
      return dispatchRemoveItem(args);
    case "storage.secureStorage.key":
      return dispatchKey(args);
    case "storage.secureStorage.clear":
      expectArgs(args, 0, 0, "uxp.storage.secureStorage.clear");
      return getSecureStorage().clear();
    default:
      return assertNever(method);
  }
}

function dispatchSetItem(args: readonly unknown[]): Promise<void> {
  expectArgs(args, 2, 2, "uxp.storage.secureStorage.setItem");
  const key = args[0];
  const value = args[1];
  assertKey(key, "uxp.storage.secureStorage.setItem key");
  if (!isFsTransportData(value)) {
    throw new Error("uxp.storage.secureStorage.setItem value must be string or binary transport data.");
  }

  return getSecureStorage().setItem(key, fsTransportToHostValue(value));
}

async function dispatchGetItem(args: readonly unknown[]): Promise<ReturnType<typeof fsBytesToTransport>> {
  expectArgs(args, 1, 1, "uxp.storage.secureStorage.getItem");
  const key = args[0];
  assertKey(key, "uxp.storage.secureStorage.getItem key");

  return fsBytesToTransport(toUint8Array(await getSecureStorage().getItem(key)));
}

function dispatchRemoveItem(args: readonly unknown[]): Promise<void> {
  expectArgs(args, 1, 1, "uxp.storage.secureStorage.removeItem");
  const key = args[0];
  assertKey(key, "uxp.storage.secureStorage.removeItem key");
  return getSecureStorage().removeItem(key);
}

function dispatchKey(args: readonly unknown[]): string {
  expectArgs(args, 1, 1, "uxp.storage.secureStorage.key");
  const index = args[0];
  assertNonNegativeInteger(index, "uxp.storage.secureStorage.key index");
  return getSecureStorage().key(index);
}

function getSecureStorage(): UxpKeyValueStorageHostModule["storage"]["secureStorage"] {
  return require("uxp").storage.secureStorage;
}

function expectArgs(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): void {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }
}

function assertKey(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function toUint8Array(value: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp key-value-storage method: ${String(method)}`);
}
