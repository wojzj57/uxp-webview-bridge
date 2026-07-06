import type { UxpHost } from "./host/index.js";
import type { UxpSecureStorage, UxpStorage as UxpKeyValueStorage } from "./key-value-storage/index.js";
import type {
  UxpFileSystemProvider,
  UxpLocalFileSystemProvider,
  UxpPersistentFileStorage,
  UxpStorageEntry,
  UxpStorageEntryMetadata,
  UxpStorageFile,
  UxpStorageFolder,
  UxpStorageSymbol
} from "./persistent-file-storage/index.js";
import type { UxpPlugin, UxpPluginManager } from "./plugin-manager/index.js";
import type { UxpShell } from "./shell/index.js";
import type { UxpUserInfo } from "./user-info/index.js";
import type { UxpVersions } from "./versions/index.js";
import type { UxpXmp } from "./xmp/index.js";

export interface UxpNamespace {
  readonly host: UxpHost;
  readonly pluginManager: UxpPluginManager;
  readonly shell: UxpShell;
  readonly storage: UxpStorage;
  readonly userInfo: UxpUserInfo;
  readonly versions: UxpVersions;
  readonly xmp: UxpXmp;
}

export interface UxpStorage extends UxpKeyValueStorage, UxpPersistentFileStorage {}

export type { UxpHost };
export type { UxpSecureStorage };
export type {
  UxpFileSystemProvider,
  UxpLocalFileSystemProvider,
  UxpPersistentFileStorage,
  UxpStorageEntry,
  UxpStorageEntryMetadata,
  UxpStorageFile,
  UxpStorageFolder,
  UxpStorageSymbol
};
export type { UxpPlugin };
export type { UxpPluginManager };
export type { UxpShell };
export type { UxpUserInfo };
export type { UxpVersions };
export type { UxpXmp };
