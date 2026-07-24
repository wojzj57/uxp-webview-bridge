import { fsTransportToUint8Array, fsValueToTransport, type FsBinaryTransportData } from "@shared/uxp-api/fs-protocol.js";
import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpStorage } from "./types.js";

interface UxpKeyValueStorageRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpKeyValueStorageNamespace(rpc: UxpKeyValueStorageRpc): UxpStorage {
  return {
    secureStorage: {
      get length() {
        return rpc.call<number>(UXP_MODULE_ID, "storage.secureStorage.length");
      },
      setItem: (key, value) =>
        rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.setItem", [key, fsValueToTransport(value)]),
      async getItem(key) {
        return fsTransportToUint8Array(
          await rpc.call<FsBinaryTransportData>(UXP_MODULE_ID, "storage.secureStorage.getItem", [key])
        );
      },
      removeItem: (key) => rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.removeItem", [key]),
      key: (index) => rpc.call<string>(UXP_MODULE_ID, "storage.secureStorage.key", [index]),
      clear: () => rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.clear")
    }
  };
}
