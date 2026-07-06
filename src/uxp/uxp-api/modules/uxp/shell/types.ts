import type { shell as nativeShell } from "@shared/types/uxp/internal/shell.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpShellHostModule {
  readonly shell: typeof nativeShell;
}

export type UxpShellMethodName = Extract<UxpProtocolMethodName, `shell.${string}`>;
export type UxpShellResult = Awaited<ReturnType<typeof nativeShell.openPath>>;
