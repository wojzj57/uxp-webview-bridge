import type { versions as nativeVersions } from "@shared/types/uxp/internal/versions.js";

export interface UxpVersions {
  readonly uxp: Promise<typeof nativeVersions.uxp>;
  readonly plugin: Promise<typeof nativeVersions.plugin>;
}
