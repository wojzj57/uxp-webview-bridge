import {
  secureStorageTransportToUint8Array,
  secureStorageValueToTransport
} from "../../../../../shared/contracts/uxp.js";
import { callUxp, type UxpRpc } from "../rpc.js";
import type { RemoteUxpSecureStorage } from "../types/remote.js";

export function createSecureStorageNamespace(rpc: UxpRpc): RemoteUxpSecureStorage {
  return {
    get length() {
      return callUxp<number>(rpc, "storage.secureStorage.length");
    },
    setItem(key, value) {
      return callUxp<void>(rpc, "storage.secureStorage.setItem", [
        key,
        secureStorageValueToTransport(value)
      ]);
    },
    async getItem(key) {
      const value = await callUxp<ReturnType<typeof secureStorageValueToTransport>>(
        rpc,
        "storage.secureStorage.getItem",
        [key]
      );
      return secureStorageTransportToUint8Array(value);
    },
    removeItem: (key) =>
      callUxp<void>(rpc, "storage.secureStorage.removeItem", [key]),
    key: (index) => callUxp<string>(rpc, "storage.secureStorage.key", [index]),
    clear: () => callUxp<void>(rpc, "storage.secureStorage.clear")
  };
}
