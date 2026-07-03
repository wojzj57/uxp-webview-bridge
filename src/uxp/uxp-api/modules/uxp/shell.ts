import type { BridgeCapabilities } from "../../../../shared/types.js";
import { requireUxpSubmodule } from "./host-module.js";
import {
  assertOptionalUxpString,
  assertUxpCapability,
  assertUxpString,
  expectUxpArgs
} from "./validation.js";

export async function dispatchShellCall(
  method: "shell.openPath" | "shell.openExternal",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpCapability(capabilities, "shell");

  switch (method) {
    case "shell.openPath": {
      const [path, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openPath"
      );
      assertUxpString(path, "uxp.shell.openPath path");
      assertOptionalUxpString(developerText, "uxp.shell.openPath developerText");
      return requireUxpSubmodule("shell").openPath(path, developerText);
    }

    case "shell.openExternal": {
      const [url, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openExternal"
      );
      assertUxpString(url, "uxp.shell.openExternal url");
      assertOptionalUxpString(developerText, "uxp.shell.openExternal developerText");
      if (url.startsWith("file:")) {
        throw new Error("uxp.shell.openExternal does not allow file: URLs; use openPath instead.");
      }
      const result = await requireUxpSubmodule("shell").openExternal(url, developerText);
      return typeof result === "string" ? result : "";
    }
  }
}
