import type { storage as nativeStorage } from "@shared/types/uxp/internal/storage.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpKeyValueStorageHostModule {
  readonly storage: {
    readonly secureStorage: typeof nativeStorage.secureStorage;
  };
}

export type UxpKeyValueStorageMethodName = Extract<UxpProtocolMethodName, `storage.secureStorage.${string}`>;
