import type { UxpHostHostModule, UxpHostMethodName, UxpHostValue } from "./types.js";

declare const require: (moduleName: "uxp") => UxpHostHostModule;

export function dispatchUxpHostCall(
  method: UxpHostMethodName,
  args: readonly unknown[]
): UxpHostValue {
  if (args.length > 0) {
    throw new Error(`uxp.${method} does not accept arguments.`);
  }

  return readHostValue(method);
}

function readHostValue(method: UxpHostMethodName): UxpHostValue {
  const host = require("uxp").host;

  switch (method) {
    case "host.name":
      return host.name;
    case "host.version":
      return host.version;
    case "host.uiLocale":
      return host.uiLocale;
    default:
      return assertNever(method);
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp host method: ${method}`);
}
