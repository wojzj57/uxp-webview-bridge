import {
  assertPhotoshopCoreMethodName,
  PHOTOSHOP_CORE_MODULE_ID,
  type PhotoshopCoreMethodName
} from "@shared/photoshop-api/core-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import type { PhotoshopCoreHost, PhotoshopCoreHostModule } from "./types.js";

declare const require: (moduleName: "photoshop") => PhotoshopCoreHostModule;

export const coreModuleAdapter: UxpModuleAdapter = {
  moduleId: PHOTOSHOP_CORE_MODULE_ID,
  capability: "photoshop",
  dispatch: dispatchCoreCall
};

/** Dispatch query-only core calls; none of these operations enters executeAsModal. */
export function dispatchCoreCall(method: string, args: readonly unknown[]): unknown | Promise<unknown> {
  assertPhotoshopCoreMethodName(method);
  const core = getCore();

  switch (method) {
    case "core.apiVersion":
      expectArgs(args, 0, method);
      return assertFiniteNumber(core.apiVersion, `${method} result`);
    case "core.getActiveTool":
      return dispatchActiveTool(core, args, method);
    case "core.getCPUInfo":
    case "core.getGPUInfo":
    case "core.getPluginInfo":
      return dispatchObjectQuery(core, args, method);
    case "core.getDisplayConfiguration":
      return dispatchDisplayConfiguration(core, args, method);
    case "core.getMenuCommandState":
      return dispatchMenuCommandState(core, args, method);
    case "core.getMenuCommandTitle":
      return dispatchMenuCommandTitle(core, args, method);
    case "core.getUserIdleTime":
      expectArgs(args, 0, method);
      return resolveResult(callCore(core, "getUserIdleTime"), (value) =>
        assertFiniteNumber(value, `${method} result`)
      );
    case "core.historySuspended":
      return dispatchHistorySuspended(core, args, method);
    case "core.isModal":
      expectArgs(args, 0, method);
      return resolveResult(callCore(core, "isModal"), (value) =>
        assertBoolean(value, `${method} result`)
      );
    case "core.translateUIString":
      expectArgs(args, 1, method);
      return resolveResult(
        callCore(core, "translateUIString", [assertString(args[0], `${method} zstring`)]),
        (value) => assertString(value, `${method} result`)
      );
    default:
      return unsupported(method);
  }
}

function dispatchActiveTool(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  expectArgs(args, 0, method);
  return resolveResult(callCore(core, "getActiveTool"), (value) => normalizeActiveTool(value, method));
}

function dispatchObjectQuery(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getCPUInfo" | "core.getGPUInfo" | "core.getPluginInfo"
): unknown | Promise<unknown> {
  expectArgs(args, 0, method);
  return resolveResult(callCore(core, method.slice("core.".length)), (value) =>
    assertObject(value, `${method} result`)
  );
}

function dispatchDisplayConfiguration(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  expectArgsRange(args, 0, 1, method);
  const options = args.length === 0 ? {} : assertObject(args[0], `${method} options`);
  return resolveResult(callCore(core, "getDisplayConfiguration", [options]), (value) => {
    if (!Array.isArray(value)) {
      throw new Error(`${method} returned a non-array value.`);
    }
    return value;
  });
}

function dispatchMenuCommandState(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  const options = expectOptions(args, method);
  assertInteger(options.commandID, `${method} options.commandID`);
  return resolveResult(callCore(core, "getMenuCommandState", [options]), (value) =>
    normalizeMenuState(value, method)
  );
}

function dispatchMenuCommandTitle(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  const options = expectOptions(args, method);
  const hasCommand = typeof options.commandID === "number";
  const hasMenu = typeof options.menuID === "number";
  if (hasCommand === hasMenu) {
    throw new Error(`${method} options must contain exactly one of commandID or menuID.`);
  }
  assertInteger(hasCommand ? options.commandID : options.menuID, `${method} option id`);
  return resolveResult(callCore(core, "getMenuCommandTitle", [options]), (value) =>
    normalizeMenuTitle(value, method)
  );
}

function dispatchHistorySuspended(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  const options = expectOptions(args, method);
  assertInteger(options.documentID, `${method} options.documentID`);
  return resolveResult(callCore(core, "historySuspended", [options]), (value) =>
    assertBoolean(value, `${method} result`)
  );
}

function normalizeActiveTool(value: unknown, method: string): Record<string, unknown> {
  const tool = assertObject(value, `${method} result`);
  return {
    title: assertString(tool.title, `${method} result.title`),
    isModal: assertBoolean(tool.isModal, `${method} result.isModal`),
    key: assertString(tool.key, `${method} result.key`),
    classID: assertString(tool.classID ?? tool.classId, `${method} result.classID`)
  };
}

function normalizeMenuState(value: unknown, method: string): boolean {
  const state = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return assertBoolean(state, `${method} result`);
}

function normalizeMenuTitle(value: unknown, method: string): string {
  const title = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return assertString(title, `${method} result`);
}

function callCore(core: PhotoshopCoreHost, method: string, args: readonly unknown[] = []): unknown {
  const target = core[method];
  if (typeof target !== "function") {
    throw new Error(`photoshop.core does not implement ${method}.`);
  }
  return (target as (...values: unknown[]) => unknown).apply(core, [...args]);
}

function resolveResult(value: unknown, normalize: (resolved: unknown) => unknown): unknown | Promise<unknown> {
  return value && typeof (value as Promise<unknown>).then === "function"
    ? (value as Promise<unknown>).then(normalize)
    : normalize(value);
}

function expectOptions(args: readonly unknown[], method: string): Record<string, unknown> {
  expectArgs(args, 1, method);
  return assertObject(args[0], `${method} options`);
}

function expectArgs(args: readonly unknown[], length: number, method: string): void {
  if (args.length !== length) {
    throw new Error(`${method} expects ${length} arguments.`);
  }
}

function expectArgsRange(args: readonly unknown[], min: number, max: number, method: string): void {
  if (args.length < min || args.length > max) {
    throw new Error(`${method} expects ${min}-${max} arguments.`);
  }
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function unsupported(method: PhotoshopCoreMethodName): never {
  throw new Error(`Unsupported photoshop core method: ${method}`);
}

function getCore(): PhotoshopCoreHost {
  return require("photoshop").core;
}
