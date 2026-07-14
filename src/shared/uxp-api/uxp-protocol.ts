export const UXP_MODULE_ID = "uxp-api/modules/uxp";

export const UXP_METHOD_NAMES = [
  "host.name",
  "host.version",
  "host.uiLocale",
  "versions.uxp",
  "versions.plugin",
  "shell.openPath",
  "shell.openExternal",
  "userInfo.userId",
  "pluginManager.plugins",
  "plugin.showPanel",
  "plugin.invokeCommand",
  "storage.secureStorage.length",
  "storage.secureStorage.setItem",
  "storage.secureStorage.getItem",
  "storage.secureStorage.removeItem",
  "storage.secureStorage.key",
  "storage.secureStorage.clear",
  "storage.localFileSystem.getFileForOpening",
  "storage.localFileSystem.getFileForSaving",
  "storage.localFileSystem.getFolder",
  "storage.localFileSystem.getTemporaryFolder",
  "storage.localFileSystem.getDataFolder",
  "storage.localFileSystem.getPluginFolder",
  "storage.localFileSystem.createEntryWithUrl",
  "storage.localFileSystem.getEntryWithUrl",
  "storage.localFileSystem.getFsUrl",
  "storage.localFileSystem.getNativePath",
  "storage.localFileSystem.createSessionToken",
  "storage.localFileSystem.getEntryForSessionToken",
  "storage.localFileSystem.createPersistentToken",
  "storage.localFileSystem.getEntryForPersistentToken",
  "storage.entry.dispose",
  "storage.entry.toString",
  "storage.entry.copyTo",
  "storage.entry.moveTo",
  "storage.entry.delete",
  "storage.entry.getMetadata",
  "storage.file.read",
  "storage.file.write",
  "storage.folder.getEntries",
  "storage.folder.createEntry",
  "storage.folder.createFile",
  "storage.folder.createFolder",
  "storage.folder.getEntry",
  "storage.folder.renameEntry",
  "xmp.meta.create",
  "xmp.meta.dispose",
  "xmp.meta.appendArrayItem",
  "xmp.meta.countArrayItems",
  "xmp.meta.deleteArrayItem",
  "xmp.meta.deleteProperty",
  "xmp.meta.deleteStructField",
  "xmp.meta.deleteQualifier",
  "xmp.meta.doesArrayItemExist",
  "xmp.meta.doesPropertyExist",
  "xmp.meta.doesStructFieldExist",
  "xmp.meta.doesQualifierExist",
  "xmp.meta.dumpObject",
  "xmp.meta.getArrayItem",
  "xmp.meta.getLocalizedText",
  "xmp.meta.getProperty",
  "xmp.meta.getStructField",
  "xmp.meta.getQualifier",
  "xmp.meta.insertArrayItem",
  "xmp.meta.iterator",
  "xmp.meta.serialize",
  "xmp.meta.serializeToArray",
  "xmp.meta.setArrayItem",
  "xmp.meta.setLocalizedText",
  "xmp.meta.setStructField",
  "xmp.meta.setQualifier",
  "xmp.meta.setProperty",
  "xmp.meta.sort",
  "xmp.meta.deleteNamespace",
  "xmp.meta.dumpNamespaces",
  "xmp.meta.getNamespacePrefix",
  "xmp.meta.getNamespaceURI",
  "xmp.meta.registerNamespace",
  "xmp.file.create",
  "xmp.file.dispose",
  "xmp.file.canPutXMP",
  "xmp.file.closeFile",
  "xmp.file.getXMP",
  "xmp.file.getPacketInfo",
  "xmp.file.getFileInfo",
  "xmp.file.putXMP",
  "xmp.file.getFormatInfo",
  "xmp.iterator.dispose",
  "xmp.iterator.next",
  "xmp.iterator.skipSiblings",
  "xmp.iterator.skipSubtree",
  "xmp.dateTime.create",
  "xmp.dateTime.dispose",
  "xmp.dateTime.getProperty",
  "xmp.dateTime.setProperty",
  "xmp.dateTime.batchGet",
  "xmp.dateTime.batchSet",
  "xmp.dateTime.compareTo",
  "xmp.dateTime.convertToLocalTime",
  "xmp.dateTime.convertToUTCTime",
  "xmp.dateTime.getDate",
  "xmp.dateTime.setLocalTimeZone",
  "xmp.dateTime.hasDate",
  "xmp.dateTime.hasTime",
  "xmp.dateTime.hasTimeZone",
  "xmp.dateTime.toString",
  "xmp.utils.appendProperties",
  "xmp.utils.catenateArrayItems",
  "xmp.utils.composeArrayItemPath",
  "xmp.utils.composeFieldSelector",
  "xmp.utils.composeLangSelector",
  "xmp.utils.composeStructFieldPath",
  "xmp.utils.composeQualifierPath",
  "xmp.utils.duplicateSubtree",
  "xmp.utils.removeProperties",
  "xmp.utils.separateArrayItems"
] as const;

export type UxpProtocolMethodName = (typeof UXP_METHOD_NAMES)[number];

export type UxpStorageSymbolNamespace = "domains" | "formats" | "modes" | "types";

export interface UxpStorageSymbolReference {
  readonly kind: "uxp.storage.symbol";
  readonly namespace: UxpStorageSymbolNamespace;
  readonly name: string;
}

export type UxpStorageEntryType = "entry" | "file" | "folder";

export interface UxpStorageSerializedEntry {
  readonly isEntry: true;
  readonly isFile: boolean;
  readonly isFolder: boolean;
  readonly name: string;
  readonly url?: string | undefined;
  readonly nativePath?: string | undefined;
  readonly mode?: UxpStorageSymbolReference | undefined;
}

export interface UxpStorageEntryReference {
  readonly kind: "uxp.storage.entry";
  readonly type: UxpStorageEntryType;
  readonly id: string;
  readonly entry: UxpStorageSerializedEntry;
}

export function isUxpStorageEntryReference(value: unknown): value is UxpStorageEntryReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UxpStorageEntryReference>;
  return candidate.kind === "uxp.storage.entry"
    && (candidate.type === "entry" || candidate.type === "file" || candidate.type === "folder")
    && typeof candidate.id === "string";
}

export interface UxpStorageSerializedEntryMetadata {
  readonly name: string;
  readonly size: number;
  readonly dateCreated?: string | undefined;
  readonly dateModified?: string | undefined;
  readonly isFile: boolean;
  readonly isFolder: boolean;
}

const UXP_METHOD_SET = new Set<string>(UXP_METHOD_NAMES);

export function isUxpProtocolMethodName(method: string): method is UxpProtocolMethodName {
  return UXP_METHOD_SET.has(method);
}

export function assertUxpProtocolMethodName(method: string): asserts method is UxpProtocolMethodName {
  if (!isUxpProtocolMethodName(method)) {
    throw new Error(`Unsupported uxp method: ${method}`);
  }
}
