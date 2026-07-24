import {
  assertPhotoshopCoreMethodName,
  PHOTOSHOP_CORE_MODULE_ID,
  type PhotoshopCoreMethodName
} from "@shared/photoshop-api/core-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import {
  normalizeActiveTool,
  normalizeLayerTreeList,
  normalizeMenuState,
  normalizeMenuTitle,
  normalizeSize
} from "./results.js";
import type { PhotoshopCoreHost, PhotoshopCoreHostModule } from "./types.js";
import {
  assertBoolean,
  assertColorConversionModel,
  assertFiniteNumber,
  assertInteger,
  assertObject,
  assertSize,
  assertString,
  expectArgs,
  expectArgsRange,
  expectDocumentOptions,
  expectOptions
} from "./validation.js";

declare const require: (moduleName: "photoshop") => PhotoshopCoreHostModule;

export const coreModuleAdapter: UxpModuleAdapter = {
  moduleId: PHOTOSHOP_CORE_MODULE_ID,
  capability: "photoshop",
  dispatch: dispatchCoreCall
};

/** Dispatch non-mutating core calls; none of these operations enters executeAsModal. */
export function dispatchCoreCall(method: string, args: readonly unknown[]): unknown | Promise<unknown> {
  assertPhotoshopCoreMethodName(method);
  const core = getCore();

  switch (method) {
    case "core.apiVersion":
      expectArgs(args, 0, method);
      return assertFiniteNumber(core.apiVersion, `${method} result`);
    case "core.calculateDialogSize":
      return dispatchCalculateDialogSize(core, args, method);
    case "core.convertColor":
      return dispatchConvertColor(core, args, method);
    case "core.getActiveTool":
      return dispatchActiveTool(core, args, method);
    case "core.getCPUInfo":
    case "core.getGPUInfo":
    case "core.getPluginInfo":
      return dispatchObjectQuery(core, args, method);
    case "core.getLayerGroupContents":
    case "core.getLayerGroupContentsSync":
      return dispatchLayerGroupContents(core, args, method);
    case "core.getLayerTree":
    case "core.getLayerTreeSync":
      return dispatchLayerTree(core, args, method);
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

function dispatchCalculateDialogSize(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  const options = expectOptions(args, method);
  assertSize(options.preferredSize, `${method} options.preferredSize`);
  if (options.minimumSize !== undefined) {
    assertSize(options.minimumSize, `${method} options.minimumSize`);
  }
  if (options.identifier !== undefined) {
    assertString(options.identifier, `${method} options.identifier`);
  }
  return resolveResult(callCore(core, "calculateDialogSize", [options]), (value) =>
    normalizeSize(value, `${method} result`)
  );
}

function dispatchConvertColor(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown | Promise<unknown> {
  expectArgs(args, 2, method);
  const sourceColor = assertObject(args[0], `${method} sourceColor`);
  assertString(sourceColor._obj, `${method} sourceColor._obj`);
  const targetModel = assertColorConversionModel(args[1], `${method} targetModel`);
  return resolveResult(callCore(core, "convertColor", [sourceColor, targetModel]), (value) =>
    assertObject(value, `${method} result`)
  );
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

function dispatchLayerGroupContents(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getLayerGroupContents" | "core.getLayerGroupContentsSync"
): unknown | Promise<unknown> {
  const options = expectDocumentOptions(args, method);
  assertInteger(options.layerID, `${method} options.layerID`);
  return resolveResult(callCore(core, method.slice("core.".length), [options]), (value) =>
    normalizeLayerTreeList(value, method)
  );
}

function dispatchLayerTree(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getLayerTree" | "core.getLayerTreeSync"
): unknown | Promise<unknown> {
  const options = expectDocumentOptions(args, method);
  return resolveResult(callCore(core, method.slice("core.".length), [options]), (value) =>
    normalizeLayerTreeList(value, method)
  );
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

function unsupported(method: PhotoshopCoreMethodName): never {
  throw new Error(`Unsupported photoshop core method: ${method}`);
}

function getCore(): PhotoshopCoreHost {
  return require("photoshop").core;
}
