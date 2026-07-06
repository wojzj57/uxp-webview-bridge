import type { shell as nativeShell } from "@shared/types/uxp/internal/shell.js";

export type UxpShellOpenExternalUrl = Parameters<typeof nativeShell.openExternal>[0];

export interface UxpShell {
  openPath(
    path: Parameters<typeof nativeShell.openPath>[0],
    developerText?: Parameters<typeof nativeShell.openPath>[1]
  ): ReturnType<typeof nativeShell.openPath>;
  openExternal(
    url: UxpShellOpenExternalUrl,
    developerText?: Parameters<typeof nativeShell.openExternal>[1]
  ): ReturnType<typeof nativeShell.openExternal>;
}
