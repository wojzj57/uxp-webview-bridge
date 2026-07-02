import { getBridgeRpcClient } from "../../../runtime.js";
import {
  OS_MODULE_ID,
  type CpuInfo,
  type OsNamespace
} from "../../../../shared/contracts/os.js";

interface OsRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createOsNamespace(rpc: OsRpc): OsNamespace {
  return {
    platform: () => rpc.call<string>(OS_MODULE_ID, "platform"),
    release: () => rpc.call<string>(OS_MODULE_ID, "release"),
    arch: () => rpc.call<string>(OS_MODULE_ID, "arch"),
    cpus: () => rpc.call<readonly CpuInfo[]>(OS_MODULE_ID, "cpus"),
    totalmem: () => rpc.call<number>(OS_MODULE_ID, "totalmem"),
    freemem: () => rpc.call<number>(OS_MODULE_ID, "freemem"),
    homedir: () => rpc.call<string>(OS_MODULE_ID, "homedir")
  };
}

export const os: OsNamespace = createOsNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
