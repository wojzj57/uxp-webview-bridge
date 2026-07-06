import type { userInfo as nativeUserInfo } from "@shared/types/uxp/internal/user-info.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpUserInfoHostModule {
  readonly userInfo: typeof nativeUserInfo;
}

export type UxpUserInfoMethodName = Extract<UxpProtocolMethodName, `userInfo.${string}`>;
export type UxpUserInfoValue = ReturnType<typeof nativeUserInfo.userId>;
