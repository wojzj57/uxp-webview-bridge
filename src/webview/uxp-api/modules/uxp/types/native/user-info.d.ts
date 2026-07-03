/**
 * User information for the current plugin user.
 * @see uxp-document/uxp-api/reference-js/modules/uxp/user-information/user-info.md
 */
interface UserInfo {
  /**
   * Returns the GUID of the plugin user.
   */
  userId: () => string;
}

export const userInfo: UserInfo;
