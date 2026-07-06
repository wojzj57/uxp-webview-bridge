import { LOCAL_STORAGE_MODULE_ID } from "@shared/uxp-api/storage-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { LocalStorageNamespace } from "./types.js";

interface StorageRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createLocalStorageNamespace(rpc: StorageRpc): LocalStorageNamespace {
  return createStorageNamespace(rpc, LOCAL_STORAGE_MODULE_ID);
}

export const localStorage: LocalStorageNamespace = createLocalStorageNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

function createStorageNamespace(rpc: StorageRpc, moduleId: string): LocalStorageNamespace {
  return {
    get length() {
      return rpc.call<number>(moduleId, "length");
    },
    key: (index) => rpc.call<string | null>(moduleId, "key", [index]),
    getItem: (key) => rpc.call<string | null>(moduleId, "getItem", [key]),
    setItem: (key, value) => rpc.call<void>(moduleId, "setItem", [key, value]),
    removeItem: (key) => rpc.call<void>(moduleId, "removeItem", [key]),
    clear: () => rpc.call<void>(moduleId, "clear")
  };
}
