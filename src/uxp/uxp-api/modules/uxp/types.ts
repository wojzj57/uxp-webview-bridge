import type { host as nativeHost } from "@shared/types/uxp/internal/host.js";
import type { pluginManager as nativePluginManager } from "@shared/types/uxp/internal/plugin-manager.js";
import type { shell as nativeShell } from "@shared/types/uxp/internal/shell.js";
import type { storage as nativeStorage } from "@shared/types/uxp/internal/storage.js";
import type { userInfo as nativeUserInfo } from "@shared/types/uxp/internal/user-info.js";
import type { versions as nativeVersions } from "@shared/types/uxp/internal/versions.js";
import type { xmp as nativeXmp } from "@shared/types/uxp/internal/xmp.js";
import type { UxpHostMethodName, UxpHostValue } from "./host/types.js";
import type { UxpKeyValueStorageHostModule, UxpKeyValueStorageMethodName } from "./key-value-storage/types.js";
import type {
  UxpPersistentFileStorageHostModule,
  UxpPersistentFileStorageMethodName
} from "./persistent-file-storage/types.js";
import type {
  UxpPluginManagerHostModule,
  UxpPluginManagerMethodName,
  UxpSerializedPlugin
} from "./plugin-manager/types.js";
import type { UxpShellMethodName } from "./shell/types.js";
import type { UxpUserInfoMethodName, UxpUserInfoValue } from "./user-info/types.js";
import type { UxpVersionValue, UxpVersionsMethodName } from "./versions/types.js";
import type { UxpXmpHostModule, UxpXmpMethodName } from "./xmp/types.js";

export interface UxpHostModule {
  readonly host: typeof nativeHost;
  readonly pluginManager: typeof nativePluginManager;
  readonly shell: typeof nativeShell;
  readonly storage: Pick<
    typeof nativeStorage,
    | "domains"
    | "errors"
    | "fileTypes"
    | "formats"
    | "localFileSystem"
    | "modes"
    | "secureStorage"
    | "types"
  >;
  readonly userInfo: typeof nativeUserInfo;
  readonly versions: typeof nativeVersions;
  readonly xmp: typeof nativeXmp;
}

export type { UxpHostMethodName, UxpHostValue };
export type { UxpKeyValueStorageHostModule, UxpKeyValueStorageMethodName };
export type { UxpPersistentFileStorageHostModule, UxpPersistentFileStorageMethodName };
export type { UxpPluginManagerHostModule, UxpPluginManagerMethodName, UxpSerializedPlugin };
export type { UxpShellMethodName };
export type { UxpUserInfoMethodName, UxpUserInfoValue };
export type { UxpVersionValue, UxpVersionsMethodName };
export type { UxpXmpHostModule, UxpXmpMethodName };
