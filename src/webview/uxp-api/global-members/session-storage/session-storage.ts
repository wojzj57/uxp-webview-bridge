import { SESSION_STORAGE_MODULE_ID } from "@shared/uxp-api/storage-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { SessionStorageNamespace } from "./types.js";

interface StorageRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createSessionStorageNamespace(rpc: StorageRpc): SessionStorageNamespace {
  return {
    get length() {
      return rpc.call<number>(SESSION_STORAGE_MODULE_ID, "length");
    },
    key: (index) => rpc.call<string | null>(SESSION_STORAGE_MODULE_ID, "key", [index]),
    getItem: (key) => rpc.call<string | null>(SESSION_STORAGE_MODULE_ID, "getItem", [key]),
    setItem: (key, value) => rpc.call<void>(SESSION_STORAGE_MODULE_ID, "setItem", [key, value]),
    removeItem: (key) => rpc.call<void>(SESSION_STORAGE_MODULE_ID, "removeItem", [key]),
    clear: () => rpc.call<void>(SESSION_STORAGE_MODULE_ID, "clear")
  };
}

export const sessionStorage: SessionStorageNamespace = createSessionStorageNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
