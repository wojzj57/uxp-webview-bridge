import {
  assertPathProtocolMethodName,
  parsePathProtocolMethod,
  PATH_MODULE_ID,
  type PathFlavorMethodName,
  type PathFormatTransport,
  type PathParsedTransport,
  type PathProtocolFlavorName
} from "@shared/uxp-api/path-protocol.js";
import { fixedCapability, type UxpModuleAdapter } from "@uxp/module-registry.js";
import type { PathHost, PathHostFlavor } from "./types.js";

export const pathModuleAdapter: UxpModuleAdapter = {
  moduleId: PATH_MODULE_ID,
  resolveCapability: fixedCapability("path", assertPathProtocolMethodName),
  dispatch: dispatchPathCall
};

export function dispatchPathCall(method: string, args: readonly unknown[]): unknown {
  assertPathProtocolMethodName(method);
  const parsed = parsePathProtocolMethod(method);
  if (!parsed) {
    throw new Error(`Unsupported path method: ${method}`);
  }

  validatePathArgs(parsed.method, args, `path.${method}`);
  const flavor = getPathFlavor(parsed.flavor);

  switch (parsed.method) {
    case "sep":
    case "delimiter":
      return assertStringReturn(flavor[parsed.method], `path.${method}`);
    case "normalize":
    case "isAbsolute":
    case "dirname":
    case "extname":
    case "parse":
      return dispatchSinglePathArg(flavor, parsed.method, args, `path.${method}`);
    case "join":
    case "resolve":
      return assertStringReturn(flavor[parsed.method](...(args as readonly string[])), `path.${method}`);
    case "relative":
      return assertStringReturn(flavor.relative(args[0] as string, args[1] as string), `path.${method}`);
    case "basename":
      return assertStringReturn(
        args.length === 1
          ? flavor.basename(args[0] as string)
          : flavor.basename(args[0] as string, args[1] as string),
        `path.${method}`
      );
    case "format":
      return assertStringReturn(flavor.format(args[0] as PathFormatTransport), `path.${method}`);
  }
}

function dispatchSinglePathArg(
  flavor: PathHostFlavor,
  method: "normalize" | "isAbsolute" | "dirname" | "extname" | "parse",
  args: readonly unknown[],
  label: string
): unknown {
  const value = flavor[method](args[0] as string);
  if (method === "isAbsolute") {
    if (typeof value !== "boolean") {
      throw new Error(`${label} returned a non-boolean value.`);
    }
    return value;
  }
  if (method === "parse") {
    return assertParsedReturn(value, label);
  }
  return assertStringReturn(value, label);
}

function validatePathArgs(
  method: PathFlavorMethodName,
  args: readonly unknown[],
  label: string
): void {
  switch (method) {
    case "sep":
    case "delimiter":
      expectPathArgs(args, 0, 0, label);
      return;
    case "join":
    case "resolve":
      for (const arg of args) {
        assertString(arg, `${label} path`);
      }
      return;
    case "normalize":
    case "isAbsolute":
    case "dirname":
    case "extname":
    case "parse":
      expectPathArgs(args, 1, 1, label);
      assertString(args[0], `${label} path`);
      return;
    case "relative":
      expectPathArgs(args, 2, 2, label);
      assertString(args[0], `${label} from`);
      assertString(args[1], `${label} to`);
      return;
    case "basename":
      expectPathArgs(args, 1, 2, label);
      assertString(args[0], `${label} path`);
      if (args[1] !== undefined) {
        assertString(args[1], `${label} ext`);
      }
      return;
    case "format":
      expectPathArgs(args, 1, 1, label);
      assertFormatInput(args[0], label);
      return;
  }
}

function getPathFlavor(flavorName: PathProtocolFlavorName): PathHostFlavor {
  const path = (globalThis as { path?: PathHost }).path;
  if (!path) {
    throw new Error("window.path is not available.");
  }

  if (flavorName === "path") {
    return path;
  }

  const flavor = path[flavorName];
  if (!flavor) {
    throw new Error(`window.path.${flavorName} is not available.`);
  }
  return flavor;
}

function assertFormatInput(value: unknown, label: string): asserts value is PathFormatTransport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} pathObject must be an object.`);
  }

  const candidate = value as Partial<PathFormatTransport>;
  for (const key of ["root", "dir", "base", "ext", "name"] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== "string") {
      throw new Error(`${label} ${key} must be a string when provided.`);
    }
  }
}

function assertParsedReturn(value: unknown, label: string): PathParsedTransport {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Partial<PathParsedTransport>).root !== "string" ||
    typeof (value as Partial<PathParsedTransport>).dir !== "string" ||
    typeof (value as Partial<PathParsedTransport>).base !== "string" ||
    typeof (value as Partial<PathParsedTransport>).ext !== "string" ||
    typeof (value as Partial<PathParsedTransport>).name !== "string"
  ) {
    throw new Error(`${label} returned invalid path data.`);
  }

  const parsed = value as PathParsedTransport;
  return {
    root: parsed.root,
    dir: parsed.dir,
    base: parsed.base,
    ext: parsed.ext,
    name: parsed.name
  };
}

function assertStringReturn(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} returned a non-string value.`);
  }
  return value;
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function expectPathArgs(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  label: string
): void {
  if (args.length < minLength || args.length > maxLength) {
    const count = minLength === maxLength ? minLength : `${minLength}-${maxLength}`;
    throw new Error(`${label} requires ${count} argument${count === 1 ? "" : "s"}.`);
  }
}
