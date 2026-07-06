import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import type { UxpShell, UxpShellOpenExternalUrl } from "./types.js";

interface UxpShellRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpShellNamespace(rpc: UxpShellRpc): UxpShell {
  return {
    openPath: (path, developerText) =>
      rpc.call<string>(UXP_MODULE_ID, "shell.openPath", [path, ...optionalArgs(developerText)]),
    async openExternal(url, developerText) {
      const serializedUrl = serializeOpenExternalUrl(url);
      assertNotFileUrl(serializedUrl);
      return rpc.call<string>(UXP_MODULE_ID, "shell.openExternal", [
        serializedUrl,
        ...optionalArgs(developerText)
      ]);
    }
  };
}

function serializeOpenExternalUrl(url: UxpShellOpenExternalUrl): string {
  return typeof url === "string" ? url : url.toString();
}

function assertNotFileUrl(url: string): void {
  if (/^\s*file:/i.test(url)) {
    throw new Error("uxp.shell.openExternal does not allow file: URLs. Use uxp.shell.openPath instead.");
  }
}

function optionalArgs<T extends readonly unknown[]>(...args: T): unknown[] {
  const output = [...args];
  while (output.length > 0 && output[output.length - 1] === undefined) {
    output.pop();
  }
  return output;
}
