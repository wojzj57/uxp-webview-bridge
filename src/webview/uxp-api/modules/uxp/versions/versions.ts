import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpVersions } from "./types.js";

interface UxpVersionsRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpVersionsNamespace(rpc: UxpVersionsRpc): UxpVersions {
  return {
    get uxp() {
      return rpc.call<string>(UXP_MODULE_ID, "versions.uxp");
    },
    get plugin() {
      return rpc.call<string>(UXP_MODULE_ID, "versions.plugin");
    }
  };
}
