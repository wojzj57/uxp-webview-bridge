import type { BridgeCapabilities } from "../../../../shared/types.js";
import { requireUxpSubmodule } from "./host-module.js";
import { assertUxpCapability, expectUxpArgs } from "./validation.js";

export function dispatchScriptCall(
  method: "script.args" | "script.executionContext" | "script.setResult",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): unknown {
  assertUxpCapability(capabilities, "script");

  switch (method) {
    case "script.args":
      expectUxpArgs(args, 0, 0, "uxp.script.args");
      return requireUxpSubmodule("script").args;

    case "script.executionContext":
      expectUxpArgs(args, 0, 0, "uxp.script.executionContext");
      return requireUxpSubmodule("script").executionContext;

    case "script.setResult": {
      const [result] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.script.setResult");
      requireUxpSubmodule("script").setResult(result);
      return undefined;
    }
  }
}
