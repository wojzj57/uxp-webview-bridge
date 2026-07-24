export const LOCAL_STORAGE_MODULE_ID = "uxp-api/global-members/local-storage";
export const SESSION_STORAGE_MODULE_ID = "uxp-api/global-members/session-storage";

export const STORAGE_METHOD_NAMES = ["length", "key", "getItem", "setItem", "removeItem", "clear"] as const;

export type StorageProtocolMethodName = (typeof STORAGE_METHOD_NAMES)[number];

const STORAGE_METHOD_SET = new Set<string>(STORAGE_METHOD_NAMES);

export function isStorageProtocolMethodName(method: string): method is StorageProtocolMethodName {
  return STORAGE_METHOD_SET.has(method);
}

export function assertStorageProtocolMethodName(
  method: string
): asserts method is StorageProtocolMethodName {
  if (!isStorageProtocolMethodName(method)) {
    throw new Error(`Unsupported storage method: ${method}`);
  }
}
