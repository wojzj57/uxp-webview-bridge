import { UXP_MODULE_ID } from "../../../../shared/contracts/uxp.js";

export interface UxpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function callUxp<T>(
  rpc: UxpRpc,
  method: string,
  args?: readonly unknown[]
): Promise<T> {
  return rpc.call<T>(UXP_MODULE_ID, method, args);
}
