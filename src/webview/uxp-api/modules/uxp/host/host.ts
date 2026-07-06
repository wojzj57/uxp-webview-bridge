import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpHost } from "./types.js";

interface UxpHostRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpHostNamespace(rpc: UxpHostRpc): UxpHost {
  return {
    get name() {
      return rpc.call<string>(UXP_MODULE_ID, "host.name");
    },
    get version() {
      return rpc.call<string>(UXP_MODULE_ID, "host.version");
    },
    get uiLocale() {
      return rpc.call<string>(UXP_MODULE_ID, "host.uiLocale");
    }
  };
}
