import type { os as nativeOs } from "@shared/types/uxp/internal/os.js";
import {
  assertOsProtocolMethodName,
  OS_MODULE_ID
} from "@shared/uxp-api/os-protocol.js";
import { fixedCapability, type UxpModuleAdapter } from "@uxp/module-registry.js";

declare const require: (moduleName: "os") => typeof nativeOs;

export const osModuleAdapter: UxpModuleAdapter = {
  moduleId: OS_MODULE_ID,
  resolveCapability: fixedCapability("os", assertOsProtocolMethodName),
  dispatch: dispatchOsCall
};

export function dispatchOsCall(method: string, args: readonly unknown[]): unknown {
  assertOsProtocolMethodName(method);

  if (args.length > 0) {
    throw new Error(`os.${method} does not accept arguments.`);
  }

  const os = require("os");
  return os[method]();
}
