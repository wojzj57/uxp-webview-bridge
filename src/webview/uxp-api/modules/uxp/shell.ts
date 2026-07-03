import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpShell } from "./types/remote.js";

export function createShellNamespace(rpc: UxpRpc): RemoteUxpShell {
  return {
    openPath: (path, developerText) =>
      callUxp<string>(rpc, "shell.openPath", [path, developerText]),
    openExternal: (url, developerText) =>
      callUxp<string>(rpc, "shell.openExternal", [String(url), developerText])
  };
}
