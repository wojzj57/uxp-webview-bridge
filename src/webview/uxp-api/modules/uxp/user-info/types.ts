import type { userInfo as nativeUserInfo } from "@shared/types/uxp/internal/user-info.js";

export interface UxpUserInfo {
  userId(): Promise<ReturnType<typeof nativeUserInfo.userId>>;
}
