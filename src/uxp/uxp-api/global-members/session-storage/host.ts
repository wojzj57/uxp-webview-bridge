import {
  assertStorageProtocolMethodName,
  SESSION_STORAGE_MODULE_ID
} from "@shared/uxp-api/storage-protocol.js";
import { fixedCapability, type UxpModuleAdapter } from "@uxp/module-registry.js";
import { dispatchStorageCall, getStorageHost } from "../local-storage/host.js";

export const sessionStorageModuleAdapter: UxpModuleAdapter = {
  moduleId: SESSION_STORAGE_MODULE_ID,
  resolveCapability: fixedCapability("sessionStorage", assertStorageProtocolMethodName),
  dispatch: dispatchSessionStorageCall
};

export function dispatchSessionStorageCall(method: string, args: readonly unknown[]): unknown {
  return dispatchStorageCall(method, args, "sessionStorage", () => getStorageHost("sessionStorage"));
}
