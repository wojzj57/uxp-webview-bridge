import {
  assertUxpProtocolMethodName,
  UXP_MODULE_ID,
  type UxpProtocolMethodName
} from "@shared/uxp-api/uxp-protocol.js";
import type { BridgeCapabilityName } from "@shared/capabilities.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import { dispatchUxpHostCall } from "./host/host.js";
import { dispatchUxpKeyValueStorageCall } from "./key-value-storage/host.js";
import {
  createUxpPersistentFileStorageOwner,
  type UxpPersistentFileStorageOwner
} from "./persistent-file-storage/host.js";
import { createUxpPluginManagerState, dispatchUxpPluginManagerCall, type UxpPluginManagerState } from "./plugin-manager/host.js";
import { dispatchUxpShellCall } from "./shell/host.js";
import { dispatchUxpUserInfoCall } from "./user-info/host.js";
import { dispatchUxpVersionsCall } from "./versions/host.js";
import { createUxpXmpState, destroyUxpXmpHandles, dispatchUxpXmpCall } from "./xmp/host.js";

interface UxpAdapterState {
  readonly pluginManager: UxpPluginManagerState;
  readonly persistentFileStorage: UxpPersistentFileStorageOwner;
  readonly xmp: ReturnType<typeof createUxpXmpState>;
}

function createUxpAdapterState(bridgeSessionId: string): UxpAdapterState {
  return {
    pluginManager: createUxpPluginManagerState(),
    persistentFileStorage: createUxpPersistentFileStorageOwner(bridgeSessionId),
    xmp: createUxpXmpState(bridgeSessionId)
  };
}

const defaultState = createUxpAdapterState("bridge.direct");

export interface UxpSessionModuleAdapter extends UxpModuleAdapter {
  resolveStorageEntryReference(reference: unknown, expectedType?: "entry" | "file" | "folder"): unknown;
}

export function createUxpModuleAdapter(bridgeSessionId: string): UxpSessionModuleAdapter {
  const state = createUxpAdapterState(bridgeSessionId);
  return {
    moduleId: UXP_MODULE_ID,
    resolveCapability: resolveUxpCapability,
    dispatch: (method, args) => dispatchUxpCall(method, args, state),
    resolveStorageEntryReference: (reference, expectedType) =>
      state.persistentFileStorage.resolve(reference, expectedType),
    destroy: () => destroyUxpHandles(state)
  };
}

export const uxpModuleAdapter: UxpModuleAdapter = {
  moduleId: UXP_MODULE_ID,
  resolveCapability: resolveUxpCapability,
  dispatch: (method, args) => dispatchUxpCall(method, args, defaultState),
  destroy: destroyUxpHandles
};

export function dispatchUxpCall(
  method: string,
  args: readonly unknown[],
  state: UxpAdapterState = defaultState
): unknown {
  assertUxpProtocolMethodName(method);

  if (isUxpHostMethod(method)) {
    return dispatchUxpHostCall(method, args);
  }

  if (isUxpVersionsMethod(method)) {
    return dispatchUxpVersionsCall(method, args);
  }

  if (isUxpShellMethod(method)) {
    return dispatchUxpShellCall(method, args);
  }

  if (isUxpUserInfoMethod(method)) {
    return dispatchUxpUserInfoCall(method, args);
  }

  if (isUxpPluginManagerMethod(method)) {
    return dispatchUxpPluginManagerCall(method, args, state.pluginManager);
  }

  if (isUxpKeyValueStorageMethod(method)) {
    return dispatchUxpKeyValueStorageCall(method, args);
  }

  if (isUxpPersistentFileStorageMethod(method)) {
    return state.persistentFileStorage.dispatch(method, args);
  }

  if (isUxpXmpMethod(method)) {
    return dispatchUxpXmpCall(method, args, state.xmp);
  }

  return assertNever(method);
}

export function resolveUxpCapability(method: string): BridgeCapabilityName {
  assertUxpProtocolMethodName(method);
  if (isUxpHostMethod(method)) return "uxp.host";
  if (isUxpVersionsMethod(method)) return "uxp.versions";
  if (isUxpShellMethod(method)) return "uxp.shell";
  if (isUxpUserInfoMethod(method)) return "uxp.userInfo";
  if (isUxpPluginManagerMethod(method)) return "uxp.pluginManager";
  if (isUxpKeyValueStorageMethod(method)) return "uxp.storage.secureStorage";
  if (isUxpPersistentFileStorageMethod(method)) return "uxp.storage.localFileSystem";
  if (isUxpXmpMethod(method)) return "uxp.xmp";
  return assertNever(method);
}

function isUxpVersionsMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `versions.${string}`> {
  return method.startsWith("versions.");
}

function isUxpHostMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `host.${string}`> {
  return method.startsWith("host.");
}

function isUxpShellMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `shell.${string}`> {
  return method.startsWith("shell.");
}

function isUxpUserInfoMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `userInfo.${string}`> {
  return method.startsWith("userInfo.");
}

function isUxpPluginManagerMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `pluginManager.${string}` | `plugin.${string}`> {
  return method.startsWith("pluginManager.") || method.startsWith("plugin.");
}

function isUxpKeyValueStorageMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `storage.secureStorage.${string}`> {
  return method.startsWith("storage.secureStorage.");
}

function isUxpPersistentFileStorageMethod(
  method: UxpProtocolMethodName
): method is Extract<UxpProtocolMethodName, `storage.localFileSystem.${string}` | `storage.entry.${string}` | `storage.file.${string}` | `storage.folder.${string}`> {
  return (
    method.startsWith("storage.localFileSystem.") ||
    method.startsWith("storage.entry.") ||
    method.startsWith("storage.file.") ||
    method.startsWith("storage.folder.")
  );
}

function isUxpXmpMethod(method: UxpProtocolMethodName): method is Extract<UxpProtocolMethodName, `xmp.${string}`> {
  return method.startsWith("xmp.");
}

function destroyUxpHandles(state: UxpAdapterState = defaultState): void {
  state.persistentFileStorage.destroy();
  destroyUxpXmpHandles(state.xmp);
  state.pluginManager.pluginsById.clear();
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp method: ${String(method)}`);
}
