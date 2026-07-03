import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpVersions } from "./types/remote.js";

export function createVersionsNamespace(rpc: UxpRpc): RemoteUxpVersions {
  return {
    get uxp() {
      return callUxp<string>(rpc, "versions.uxp");
    },
    get plugin() {
      return callUxp<string>(rpc, "versions.plugin");
    }
  };
}
