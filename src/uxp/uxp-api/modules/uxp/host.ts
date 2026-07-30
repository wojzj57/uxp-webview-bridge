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
  destroyUxpPersistentFileStorageHandles,
  dispatchUxpPersistentFileStorageCall
} from "./persistent-file-storage/host.js";
import { dispatchUxpPluginManagerCall } from "./plugin-manager/host.js";
import { dispatchUxpShellCall } from "./shell/host.js";
import { dispatchUxpUserInfoCall } from "./user-info/host.js";
import { dispatchUxpVersionsCall } from "./versions/host.js";
import { destroyUxpXmpHandles, dispatchUxpXmpCall } from "./xmp/host.js";

export const uxpModuleAdapter: UxpModuleAdapter = {
  moduleId: UXP_MODULE_ID,
  resolveCapability: resolveUxpCapability,
  dispatch: dispatchUxpCall,
  destroy: destroyUxpHandles
};

export function dispatchUxpCall(
  method: string,
  args: readonly unknown[]
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
    return dispatchUxpPluginManagerCall(method, args);
  }

  if (isUxpKeyValueStorageMethod(method)) {
    return dispatchUxpKeyValueStorageCall(method, args);
  }

  if (isUxpPersistentFileStorageMethod(method)) {
    return dispatchUxpPersistentFileStorageCall(method, args);
  }

  if (isUxpXmpMethod(method)) {
    return dispatchUxpXmpCall(method, args);
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

function destroyUxpHandles(): void {
  destroyUxpPersistentFileStorageHandles();
  destroyUxpXmpHandles();
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp method: ${String(method)}`);
}
