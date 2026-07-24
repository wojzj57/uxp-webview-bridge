import type { host as nativeHost } from "@shared/types/uxp/internal/host.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpHostHostModule {
  readonly host: typeof nativeHost;
}

export type UxpHostMethodName = Extract<UxpProtocolMethodName, `host.${string}`>;
export type UxpHostValue = typeof nativeHost.name | typeof nativeHost.version | typeof nativeHost.uiLocale;
