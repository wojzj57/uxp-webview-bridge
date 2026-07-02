import {
  assertOsMethodName,
  OS_MODULE_ID,
  type CpuInfo
} from "../../../../shared/contracts/os.js";
import type { UxpModuleAdapter } from "../../../module-registry.js";

declare const require: (moduleName: "os") => UxpOsModule;

interface UxpOsModule {
  platform(): string;
  release(): string;
  arch(): string;
  cpus(): readonly CpuInfo[];
  totalmem(): number;
  freemem(): number;
  homedir(): string;
}

export const osModuleAdapter: UxpModuleAdapter = {
  moduleId: OS_MODULE_ID,
  capability: "os",
  dispatch: dispatchOsCall
};

export function dispatchOsCall(method: string, args: readonly unknown[]): unknown {
  assertOsMethodName(method);

  if (args.length > 0) {
    throw new Error(`os.${method} does not accept arguments.`);
  }

  const os = require("os");
  return os[method]();
}
