import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpUserInfo } from "./types/remote.js";

export function createUserInfoNamespace(rpc: UxpRpc): RemoteUxpUserInfo {
  return {
    userId: () => callUxp<string>(rpc, "userInfo.userId")
  };
}
