import type { UxpUserInfoHostModule, UxpUserInfoMethodName, UxpUserInfoValue } from "./types.js";

declare const require: (moduleName: "uxp") => UxpUserInfoHostModule;

export function dispatchUxpUserInfoCall(
  method: UxpUserInfoMethodName,
  args: readonly unknown[]
): UxpUserInfoValue {
  switch (method) {
    case "userInfo.userId":
      return dispatchUserId(args);
    default:
      return assertNever(method);
  }
}

function dispatchUserId(args: readonly unknown[]): UxpUserInfoValue {
  if (args.length > 0) {
    throw new Error("uxp.userInfo.userId does not accept arguments.");
  }

  return require("uxp").userInfo.userId();
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp userInfo method: ${method}`);
}
