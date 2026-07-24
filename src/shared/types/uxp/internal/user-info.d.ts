/**
 * UXP user information APIs used by uxp-webview-bridge.
 */
export interface UserInfo {
  userId(): string;
}

export const userInfo: UserInfo;
