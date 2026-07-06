import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpUserInfo } from "./types.js";

interface UxpUserInfoRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpUserInfoNamespace(rpc: UxpUserInfoRpc): UxpUserInfo {
  return {
    userId: () => rpc.call<string>(UXP_MODULE_ID, "userInfo.userId")
  };
}
