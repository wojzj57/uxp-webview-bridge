import type {
  UxpProtocolMethodName,
  UxpStorageEntryReference,
  UxpStorageEntryType
} from "@shared/uxp-api/uxp-protocol.js";
import type { storage as nativeStorage } from "@shared/types/uxp/internal/storage.js";

export interface UxpPersistentFileStorageHostModule {
  readonly storage: Pick<
    typeof nativeStorage,
    | "domains"
    | "errors"
    | "fileTypes"
    | "formats"
    | "localFileSystem"
    | "modes"
    | "types"
  >;
}

export interface UxpPersistentFileStorageHandle {
  readonly type: UxpStorageEntryType;
  readonly value: unknown;
  readonly touchedAt: number;
}

export type UxpPersistentFileStorageMethodName = Extract<
  UxpProtocolMethodName,
  `storage.localFileSystem.${string}` | `storage.entry.${string}` | `storage.file.${string}` | `storage.folder.${string}`
>;

export type { UxpStorageEntryReference };
