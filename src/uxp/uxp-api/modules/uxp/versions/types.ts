import type { versions as nativeVersions } from "@shared/types/uxp/internal/versions.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpVersionsHostModule {
  readonly versions: typeof nativeVersions;
}

export type UxpVersionsMethodName = Extract<UxpProtocolMethodName, `versions.${string}`>;
export type UxpVersionValue = typeof nativeVersions.uxp | typeof nativeVersions.plugin;
