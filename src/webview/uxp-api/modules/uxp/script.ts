import { callUxp, type UxpRpc } from "./rpc.js";
import type { RemoteUxpScript } from "./types/remote.js";

export function createScriptNamespace(rpc: UxpRpc): RemoteUxpScript {
  return {
    get args() {
      return callUxp<readonly unknown[]>(rpc, "script.args");
    },
    get executionContext() {
      return callUxp<unknown>(rpc, "script.executionContext");
    },
    setResult: (result) => callUxp<void>(rpc, "script.setResult", [result])
  };
}
