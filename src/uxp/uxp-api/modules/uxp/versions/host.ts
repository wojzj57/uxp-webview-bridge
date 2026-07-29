import type {
  UxpVersionValue,
  UxpVersionsHostModule,
  UxpVersionsMethodName
} from "./types.js";

declare const require: (moduleName: "uxp") => UxpVersionsHostModule;

export function dispatchUxpVersionsCall(
  method: UxpVersionsMethodName,
  args: readonly unknown[]
): UxpVersionValue {
  if (args.length > 0) {
    throw new Error(`uxp.${method} does not accept arguments.`);
  }

  return readVersion(method);
}

function readVersion(method: UxpVersionsMethodName): UxpVersionValue {
  const versions = require("uxp").versions;

  switch (method) {
    case "versions.uxp":
      return versions.uxp;
    case "versions.plugin":
      return versions.plugin;
    default:
      return assertNever(method);
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp versions method: ${String(method)}`);
}
