import {
  bytesToSecureStorageTransportValue,
  isUxpSecureStorageTransportValue,
  secureStorageTransportToHostValue
} from "../../../../../shared/contracts/uxp.js";
import type { BridgeCapabilities } from "../../../../../shared/types.js";
import { requireSecureStorage } from "../host-module.js";
import { assertStorageKey, assertUxpCapability, expectUxpArgs } from "../validation.js";

export async function dispatchSecureStorageCall(
  method:
    | "storage.secureStorage.length"
    | "storage.secureStorage.setItem"
    | "storage.secureStorage.getItem"
    | "storage.secureStorage.removeItem"
    | "storage.secureStorage.key"
    | "storage.secureStorage.clear",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpCapability(capabilities, "secureStorage");

  switch (method) {
    case "storage.secureStorage.length":
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.length");
      return requireSecureStorage().length;

    case "storage.secureStorage.setItem": {
      const [key, value] = expectUxpArgs<[string, unknown]>(
        args,
        2,
        2,
        "uxp.storage.secureStorage.setItem"
      );
      assertStorageKey(key, "uxp.storage.secureStorage.setItem key");
      if (!isUxpSecureStorageTransportValue(value)) {
        throw new Error("uxp.storage.secureStorage.setItem value must be string or binary transport data.");
      }
      await requireSecureStorage().setItem(key, secureStorageTransportToHostValue(value));
      return undefined;
    }

    case "storage.secureStorage.getItem": {
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.getItem");
      assertStorageKey(key, "uxp.storage.secureStorage.getItem key");
      const value = await requireSecureStorage().getItem(key);
      return bytesToSecureStorageTransportValue(
        value instanceof Uint8Array ? value : new Uint8Array(value)
      );
    }

    case "storage.secureStorage.removeItem": {
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.removeItem");
      assertStorageKey(key, "uxp.storage.secureStorage.removeItem key");
      await requireSecureStorage().removeItem(key);
      return undefined;
    }

    case "storage.secureStorage.key": {
      const [index] = expectUxpArgs<[number]>(args, 1, 1, "uxp.storage.secureStorage.key");
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("uxp.storage.secureStorage.key index must be a non-negative integer.");
      }
      return requireSecureStorage().key(index);
    }

    case "storage.secureStorage.clear":
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.clear");
      await requireSecureStorage().clear();
      return undefined;
  }
}
