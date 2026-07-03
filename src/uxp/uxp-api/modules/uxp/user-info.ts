import type { BridgeCapabilities } from "../../../../shared/types.js";
import { requireUxpSubmodule } from "./host-module.js";
import { assertUxpCapability, expectUxpArgs } from "./validation.js";

export function dispatchUserInfoCall(
  method: "userInfo.userId",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): string {
  assertUxpCapability(capabilities, "userInfo");
  expectUxpArgs(args, 0, 0, "uxp.userInfo.userId");
  return requireUxpSubmodule("userInfo").userId();
}
