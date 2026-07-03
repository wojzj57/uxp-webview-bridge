import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpHostInformation } from "./types/remote.js";

export function createHostNamespace(rpc: UxpRpc): RemoteUxpHostInformation {
  return {
    get name() {
      return callUxp<string>(rpc, "host.name");
    },
    get version() {
      return callUxp<string>(rpc, "host.version");
    },
    get uiLocale() {
      return callUxp<string>(rpc, "host.uiLocale");
    }
  };
}
