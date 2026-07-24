import type { UxpShellHostModule, UxpShellMethodName, UxpShellResult } from "./types.js";

declare const require: (moduleName: "uxp") => UxpShellHostModule;

export function dispatchUxpShellCall(
  method: UxpShellMethodName,
  args: readonly unknown[]
): Promise<UxpShellResult> {
  switch (method) {
    case "shell.openPath":
      return dispatchOpenPath(args);
    case "shell.openExternal":
      return dispatchOpenExternal(args);
    default:
      return assertNever(method);
  }
}

function dispatchOpenPath(args: readonly unknown[]): Promise<UxpShellResult> {
  const [path, developerText] = expectShellArgs<[string, string | undefined]>(
    args,
    1,
    2,
    "uxp.shell.openPath"
  );
  assertNonEmptyString(path, "uxp.shell.openPath path");
  assertOptionalString(developerText, "uxp.shell.openPath developerText");

  return require("uxp").shell.openPath(path, developerText);
}

function dispatchOpenExternal(args: readonly unknown[]): Promise<UxpShellResult> {
  const [url, developerText] = expectShellArgs<[string, string | undefined]>(
    args,
    1,
    2,
    "uxp.shell.openExternal"
  );
  assertNonEmptyString(url, "uxp.shell.openExternal url");
  assertNotFileUrl(url);
  assertOptionalString(developerText, "uxp.shell.openExternal developerText");

  return require("uxp").shell.openExternal(url, developerText);
}

function expectShellArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}

function assertNotFileUrl(url: string): void {
  if (/^\s*file:/i.test(url)) {
    throw new Error("uxp.shell.openExternal does not allow file: URLs. Use uxp.shell.openPath instead.");
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp shell method: ${method}`);
}
