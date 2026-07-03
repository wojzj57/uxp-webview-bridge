import type { UxpMethodName } from "../../../../shared/contracts/uxp.js";
import { requireUxp } from "./host-module.js";
import { expectUxpArgs } from "./validation.js";

export function dispatchHostPropertyCall(
  method: Extract<UxpMethodName, "host.name" | "host.version" | "host.uiLocale" | "versions.uxp" | "versions.plugin">,
  args: readonly unknown[]
): string {
  expectUxpArgs(args, 0, 0, `uxp.${method}`);
  return readUxpProperty(method);
}

function readUxpProperty(method: UxpMethodName): string {
  const uxp = requireUxp();
  switch (method) {
    case "host.name":
      return uxp.host.name;
    case "host.version":
      return uxp.host.version;
    case "host.uiLocale":
      return uxp.host.uiLocale;
    case "versions.uxp":
      return uxp.versions.uxp;
    case "versions.plugin":
      return uxp.versions.plugin;
    default:
      throw new Error(`Unsupported uxp property: ${method}`);
  }
}
