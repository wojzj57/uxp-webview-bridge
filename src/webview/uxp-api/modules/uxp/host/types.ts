import type { host as nativeHost } from "@shared/types/uxp/internal/host.js";

export interface UxpHost {
  readonly name: Promise<typeof nativeHost.name>;
  readonly version: Promise<typeof nativeHost.version>;
  readonly uiLocale: Promise<typeof nativeHost.uiLocale>;
}
