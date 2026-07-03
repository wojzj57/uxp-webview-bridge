import type { entrypoints as nativeEntrypoints } from "./native/entrypoints.js";
import type { host as nativeHost } from "./native/host.js";
import type { pluginManager as nativePluginManager } from "./native/plugin-manager.js";
import type { script as nativeScript } from "./native/script.js";
import type { shell as nativeShell } from "./native/shell.js";
import type { storage as nativeStorage } from "./native/storage.js";
import type { userInfo as nativeUserInfo } from "./native/user-info.js";
import type { versions as nativeVersions } from "./native/versions.js";
import type {
  UxpSerializedCommandInfo,
  UxpSerializedPanelInfo
} from "../../../../../shared/contracts/uxp.js";
import type {
  UxpStorageDomains,
  UxpStorageErrors,
  UxpStorageFileTypes,
  UxpStorageFormats,
  UxpStorageModes,
  UxpStorageTypes
} from "../storage/symbols.js";

export type RemoteValue<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Promise<Awaited<Return>>
  : T extends readonly unknown[]
    ? Promise<T>
  : T extends object
    ? RemoteNamespace<T>
    : Promise<T>;

export type RemoteNamespace<T> = {
  readonly [K in keyof T]: RemoteValue<T[K]>;
};

export type RemoteUxpHostInformation = RemoteNamespace<typeof nativeHost>;
export type RemoteUxpVersions = RemoteNamespace<typeof nativeVersions>;
export type RemoteUxpShell = RemoteNamespace<typeof nativeShell>;
export type RemoteUxpUserInfo = RemoteNamespace<typeof nativeUserInfo>;
export type RemoteUxpScript = RemoteNamespace<typeof nativeScript>;

type SetElement<T> = T extends Set<infer Item> ? Item : never;
type NativePlugin = SetElement<(typeof nativePluginManager)["plugins"]>;

export interface RemoteUxpPlugin
  extends Omit<NativePlugin, "showPanel" | "invokeCommand"> {
  showPanel(panelId: string): Promise<void | string>;
  invokeCommand(commandId: string, ...params: readonly unknown[]): Promise<void>;
}

export interface RemoteUxpPluginManager {
  readonly plugins: Promise<ReadonlySet<RemoteUxpPlugin>>;
}

type NativeStorage = typeof nativeStorage;
type NativeSecureStorage = NativeStorage["secureStorage"];
type NativeLocalFileSystemProvider = NativeStorage["localFileSystem"];

export type RemoteUxpSecureStorage = RemoteNamespace<NativeSecureStorage>;

export interface RemoteUxpLocalFileSystemProvider {
  readonly isFileSystemProvider: NativeLocalFileSystemProvider["isFileSystemProvider"];
  readonly supportedDomains: readonly never[];
  getFileForOpening(
    options?: Parameters<NativeLocalFileSystemProvider["getFileForOpening"]>[0]
  ): Promise<never>;
  getFileForSaving(
    suggestedName: Parameters<NativeLocalFileSystemProvider["getFileForSaving"]>[0],
    options?: Parameters<NativeLocalFileSystemProvider["getFileForSaving"]>[1]
  ): Promise<never>;
  getFolder(options?: Parameters<NativeLocalFileSystemProvider["getFolder"]>[0]): Promise<never>;
  getTemporaryFolder(): Promise<never>;
  getDataFolder(): Promise<never>;
  getPluginFolder(): Promise<never>;
  createEntryWithUrl(
    url: Parameters<NativeLocalFileSystemProvider["createEntryWithUrl"]>[0],
    options?: Parameters<NativeLocalFileSystemProvider["createEntryWithUrl"]>[1]
  ): Promise<never>;
  getEntryWithUrl(url: Parameters<NativeLocalFileSystemProvider["getEntryWithUrl"]>[0]): Promise<never>;
  getFsUrl(entry: Parameters<NativeLocalFileSystemProvider["getFsUrl"]>[0]): never;
  getNativePath(entry: Parameters<NativeLocalFileSystemProvider["getNativePath"]>[0]): never;
  createSessionToken(
    entry: Parameters<NativeLocalFileSystemProvider["createSessionToken"]>[0]
  ): never;
  getEntryForSessionToken(
    token: Parameters<NativeLocalFileSystemProvider["getEntryForSessionToken"]>[0]
  ): never;
  createPersistentToken(
    entry: Parameters<NativeLocalFileSystemProvider["createPersistentToken"]>[0]
  ): Promise<never>;
  getEntryForPersistentToken(
    token: Parameters<NativeLocalFileSystemProvider["getEntryForPersistentToken"]>[0]
  ): Promise<never>;
}

export interface RemoteUxpStorage
  extends Omit<
    NativeStorage,
    | "domains"
    | "formats"
    | "modes"
    | "types"
    | "fileTypes"
    | "errors"
    | "secureStorage"
    | "localFileSystem"
  > {
  readonly domains: UxpStorageDomains;
  readonly formats: UxpStorageFormats;
  readonly modes: UxpStorageModes;
  readonly types: UxpStorageTypes;
  readonly fileTypes: UxpStorageFileTypes;
  readonly errors: UxpStorageErrors;
  readonly secureStorage: RemoteUxpSecureStorage;
  readonly localFileSystem: RemoteUxpLocalFileSystemProvider;
}

type NativeEntrypoints = typeof nativeEntrypoints;
type NativePanelInfo = NonNullable<ReturnType<NativeEntrypoints["getPanel"]>>;
type NativeCommandInfo = NonNullable<ReturnType<NativeEntrypoints["getCommand"]>>;
type NativeMenuItems = NativePanelInfo["menuItems"];
type NativeMenuItem = ReturnType<NativeMenuItems["getItem"]>;

export type RemoteUxpMenuItemInput = Parameters<NativeMenuItems["insertAt"]>[1];

export interface RemoteUxpMenuItem extends Omit<NativeMenuItem, "label" | "enabled" | "checked" | "submenu" | "parent" | "remove"> {
  readonly label: Promise<string>;
  readonly enabled: Promise<boolean>;
  readonly checked: Promise<boolean>;
  readonly submenu: RemoteUxpMenuItems | undefined;
  readonly parent: RemoteUxpMenuItems | undefined;
  setLabel(label: string): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  setChecked(checked: boolean): Promise<void>;
  remove(): Promise<void>;
}

export interface RemoteUxpMenuItems {
  readonly size: Promise<number>;
  getItem(id: Parameters<NativeMenuItems["getItem"]>[0]): Promise<RemoteUxpMenuItem | null>;
  getItemAt(index: Parameters<NativeMenuItems["getItemAt"]>[0]): Promise<RemoteUxpMenuItem | null>;
  insertAt(
    index: Parameters<NativeMenuItems["insertAt"]>[0],
    newItem: RemoteUxpMenuItemInput
  ): Promise<void>;
  removeAt(index: Parameters<NativeMenuItems["removeAt"]>[0]): Promise<void>;
}

export interface RemoteUxpPanelInfo extends Omit<UxpSerializedPanelInfo, "menuItems"> {
  readonly menuItems: RemoteUxpMenuItems;
}

export type RemoteUxpCommandInfo = UxpSerializedCommandInfo;

export interface RemoteUxpEntrypoints {
  setup(entrypoints: Parameters<NativeEntrypoints["setup"]>[0]): never;
  getPanel(id: Parameters<NativeEntrypoints["getPanel"]>[0]): Promise<RemoteUxpPanelInfo | null>;
  getCommand(
    id: Parameters<NativeEntrypoints["getCommand"]>[0]
  ): Promise<RemoteUxpCommandInfo | null>;
}

export type RemoteUxpUnsupportedXmpConstructor = new (...args: readonly unknown[]) => never;

export interface RemoteUxpUnsupportedXmpConst {
  readonly [name: string]: never;
}

export interface RemoteUxpXmpMetaConstructor extends RemoteUxpUnsupportedXmpConstructor {
  deleteNamespace(namespaceURI: string): never;
  dumpNamespaces(): never;
  getNamespacePrefix(namespaceURI: string): never;
  getNamespaceURI(namespacePrefix: string): never;
  registerNamespace(namespaceURI: string, suggestedPrefix: string): never;
}

export interface RemoteUxpXmpFileConstructor extends RemoteUxpUnsupportedXmpConstructor {
  getFormatInfo(format: number): never;
}

export interface RemoteUxpXmpUtils {
  appendProperties(source: unknown, dest: unknown, options?: number): never;
  catenateArrayItems(
    xmpObj: unknown,
    schemaNS: string,
    arrayName: string,
    separator?: string,
    quotes?: string,
    options?: number
  ): never;
  composeArrayItemPath(schemaNS: string, arrayName: string, itemIndex: number): never;
  composeFieldSelector(
    schemaNS: string,
    arrayName: string,
    fieldNS: string,
    fieldName: string,
    fieldValue: string
  ): never;
  composeLangSelector(schemaNS: string, arrayName: string, locale: string): never;
  composeStructFieldPath(
    schemaNS: string,
    structName: string,
    fieldNS: string,
    fieldName: string
  ): never;
  composeQualifierPath(schemaNS: string, propName: string, qualNS: string, qualName: string): never;
  duplicateSubtree(
    source: unknown,
    dest: unknown,
    sourceNS: string,
    sourceRoot: string,
    destNS: string,
    destRoot?: string,
    options?: number
  ): never;
  removeProperties(xmpObj: unknown, schemaNS?: string, propName?: string, options?: number): never;
  separateArrayItems(
    xmpObj: unknown,
    schemaNS: string,
    arrayName: string,
    arrayOptions: number | undefined,
    concatString: string
  ): never;
}

export interface RemoteUxpXmpNamespace {
  readonly XMPConst: RemoteUxpUnsupportedXmpConst;
  readonly XMPDateTime: RemoteUxpUnsupportedXmpConstructor;
  readonly XMPFile: RemoteUxpXmpFileConstructor;
  readonly XMPFileInfo: RemoteUxpUnsupportedXmpConstructor;
  readonly XMPIterator: RemoteUxpUnsupportedXmpConstructor;
  readonly XMPMeta: RemoteUxpXmpMetaConstructor;
  readonly XMPPacketInfo: RemoteUxpUnsupportedXmpConstructor;
  readonly XMPProperty: RemoteUxpUnsupportedXmpConstructor;
  readonly XMPUtils: RemoteUxpXmpUtils;
}

export interface RemoteUxpNamespace {
  readonly host: RemoteUxpHostInformation;
  readonly versions: RemoteUxpVersions;
  readonly storage: RemoteUxpStorage;
  readonly shell: RemoteUxpShell;
  readonly userInfo: RemoteUxpUserInfo;
  readonly pluginManager: RemoteUxpPluginManager;
  readonly script: RemoteUxpScript;
  readonly entrypoints: RemoteUxpEntrypoints;
  readonly xmp: RemoteUxpXmpNamespace;
}
