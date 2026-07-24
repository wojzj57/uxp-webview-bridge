import {
  assertStorageProtocolMethodName,
  LOCAL_STORAGE_MODULE_ID
} from "@shared/uxp-api/storage-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import type { StorageHost } from "./types.js";

export const localStorageModuleAdapter: UxpModuleAdapter = {
  moduleId: LOCAL_STORAGE_MODULE_ID,
  dispatch: dispatchLocalStorageCall
};

export function dispatchLocalStorageCall(method: string, args: readonly unknown[]): unknown {
  return dispatchStorageCall(method, args, "localStorage", () => getStorageHost("localStorage"));
}

export function dispatchStorageCall(
  method: string,
  args: readonly unknown[],
  label: string,
  getHost: () => StorageHost
): unknown {
  assertStorageProtocolMethodName(method);

  if (method === "length") {
    expectStorageArgs<[]>(args, 0, 0, `${label}.length`);
    const value = getHost().length;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label}.length returned an invalid value.`);
    }
    return value;
  }

  if (method === "key") {
    const [index] = expectStorageArgs<[number]>(args, 1, 1, `${label}.key`);
    assertNonNegativeInteger(index, `${label}.key index`);
    return assertNullableString(getHost().key(index), `${label}.key`);
  }

  if (method === "getItem") {
    const [key] = expectStorageArgs<[string]>(args, 1, 1, `${label}.getItem`);
    assertString(key, `${label}.getItem key`);
    return assertNullableString(getHost().getItem(key), `${label}.getItem`);
  }

  if (method === "setItem") {
    const [key, value] = expectStorageArgs<[string, string]>(args, 2, 2, `${label}.setItem`);
    assertString(key, `${label}.setItem key`);
    assertString(value, `${label}.setItem value`);
    getHost().setItem(key, value);
    return undefined;
  }

  if (method === "removeItem") {
    const [key] = expectStorageArgs<[string]>(args, 1, 1, `${label}.removeItem`);
    assertString(key, `${label}.removeItem key`);
    getHost().removeItem(key);
    return undefined;
  }

  expectStorageArgs<[]>(args, 0, 0, `${label}.clear`);
  getHost().clear();
  return undefined;
}

export function getStorageHost(name: "localStorage" | "sessionStorage"): StorageHost {
  const storage = (globalThis as { localStorage?: StorageHost; sessionStorage?: StorageHost })[name];
  if (!storage) {
    throw new Error(`window.${name} is not available.`);
  }
  return storage;
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function assertNullableString(value: unknown, label: string): string | null {
  if (typeof value === "string" || value === null) {
    return value;
  }
  throw new Error(`${label} returned a non-string value.`);
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function expectStorageArgs<T extends readonly unknown[]>(
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
