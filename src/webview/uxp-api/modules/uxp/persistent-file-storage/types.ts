import type {
  UxpStorageEntryReference,
  UxpStorageSerializedEntryMetadata
} from "@shared/uxp-api/uxp-protocol.js";
import type { storage as nativeStorage } from "@shared/types/uxp/internal/storage.js";
import type { RemoteResult } from "@webview/uxp-api/remote/index.js";

export type UxpStorageSymbol = symbol;

export type UxpStorageEntryMetadata = Omit<
  UxpStorageSerializedEntryMetadata,
  "dateCreated" | "dateModified"
> & {
  readonly dateCreated?: Date | undefined;
  readonly dateModified?: Date | undefined;
};

export interface UxpStorageEntryCopyOptions {
  readonly overwrite?: boolean | undefined;
  readonly allowFolderCopy?: boolean | undefined;
}

export interface UxpStorageEntryMoveOptions {
  readonly overwrite?: boolean | undefined;
  readonly newName?: string | undefined;
}

export interface UxpStorageFileReadOptions {
  readonly format?: UxpStorageSymbol | undefined;
}

export interface UxpStorageFileWriteOptions {
  readonly format?: UxpStorageSymbol | undefined;
  readonly append?: boolean | undefined;
}

export interface UxpStorageFolderCreateEntryOptions {
  readonly type?: UxpStorageSymbol | undefined;
  readonly overwrite?: boolean | undefined;
}

export interface UxpStorageFolderCreateFileOptions {
  readonly overwrite?: boolean | undefined;
}

export interface UxpStorageFolderRenameEntryOptions {
  readonly overwrite?: boolean | undefined;
}

export interface UxpStorageFilePickerOptions {
  readonly initialDomain?: UxpStorageSymbol | undefined;
  readonly types?: readonly string[] | undefined;
  readonly initialLocation?: UxpStorageEntry | undefined;
  readonly allowMultiple?: boolean | undefined;
}

export interface UxpStorageSaveFilePickerOptions {
  readonly initialDomain?: UxpStorageSymbol | undefined;
  readonly types?: readonly string[] | undefined;
}

export interface UxpStorageFolderPickerOptions {
  readonly initialDomain?: UxpStorageSymbol | undefined;
}

export interface UxpStorageCreateEntryWithUrlOptions {
  readonly type?: UxpStorageSymbol | undefined;
  readonly overwrite?: boolean | undefined;
}

export interface UxpStorageEntry {
  readonly isEntry: true;
  readonly isFile: boolean;
  readonly isFolder: boolean;
  readonly name: string;
  readonly provider: UxpLocalFileSystemProvider;
  readonly url?: string | undefined;
  readonly nativePath?: string | undefined;
  toString(): Promise<string>;
  copyTo(folder: UxpStorageFolder, options?: UxpStorageEntryCopyOptions): RemoteResult<UxpStorageEntry>;
  moveTo(folder: UxpStorageFolder, options?: UxpStorageEntryMoveOptions): Promise<void>;
  delete(): Promise<number>;
  getMetadata(): Promise<UxpStorageEntryMetadata>;
  dispose(): Promise<void>;
}

export interface UxpStorageFile extends UxpStorageEntry {
  readonly isFile: true;
  readonly isFolder: false;
  readonly mode?: UxpStorageSymbol | undefined;
  read(options?: UxpStorageFileReadOptions): Promise<string | ArrayBuffer>;
  write(data: string | ArrayBuffer | ArrayBufferView, options?: UxpStorageFileWriteOptions): Promise<number>;
}

export interface UxpStorageFolder extends UxpStorageEntry {
  readonly isFile: false;
  readonly isFolder: true;
  getEntries(): Promise<UxpStorageEntry[]>;
  createEntry(name: string, options?: UxpStorageFolderCreateEntryOptions): RemoteResult<UxpStorageEntry>;
  createFile(name: string, options?: UxpStorageFolderCreateFileOptions): RemoteResult<UxpStorageFile>;
  createFolder(name: string): RemoteResult<UxpStorageFolder>;
  getEntry(filePath: string): RemoteResult<UxpStorageEntry>;
  renameEntry(
    entry: UxpStorageEntry,
    newName: string,
    options?: UxpStorageFolderRenameEntryOptions
  ): Promise<void>;
}

export interface UxpStorageEntryConstructor {
  new (...args: never[]): UxpStorageEntry;
}

export interface UxpStorageFileConstructor {
  new (...args: never[]): UxpStorageFile;
  isFile(entry: unknown): entry is UxpStorageFile;
}

export interface UxpStorageFolderConstructor {
  new (...args: never[]): UxpStorageFolder;
  isFolder(entry: unknown): entry is UxpStorageFolder;
}

export interface UxpStorageFileSystemProviderConstructor {
  new (...args: never[]): UxpFileSystemProvider;
  isFileSystemProvider(value: unknown): value is UxpFileSystemProvider;
}

export interface UxpStorageLocalFileSystemProviderConstructor {
  new (...args: never[]): UxpLocalFileSystemProvider;
}

export interface UxpFileSystemProvider {
  readonly isFileSystemProvider: true;
  readonly supportedDomains: readonly UxpStorageSymbol[];
}

export interface UxpLocalFileSystemProvider extends UxpFileSystemProvider {
  getFileForOpening(options?: UxpStorageFilePickerOptions): Promise<UxpStorageFile | UxpStorageFile[] | null>;
  getFileForSaving(
    suggestedName?: string,
    options?: UxpStorageSaveFilePickerOptions
  ): RemoteResult<UxpStorageFile | null>;
  getFolder(options?: UxpStorageFolderPickerOptions): RemoteResult<UxpStorageFolder | null>;
  getTemporaryFolder(): RemoteResult<UxpStorageFolder>;
  getDataFolder(): RemoteResult<UxpStorageFolder>;
  getPluginFolder(): RemoteResult<UxpStorageFolder>;
  createEntryWithUrl(
    url: string,
    options?: UxpStorageCreateEntryWithUrlOptions
  ): RemoteResult<UxpStorageEntry>;
  getEntryWithUrl(url: string): RemoteResult<UxpStorageEntry>;
  getFsUrl(entry: UxpStorageEntry): Promise<string>;
  getNativePath(entry: UxpStorageEntry): Promise<string>;
  createSessionToken(entry: UxpStorageEntry): Promise<string>;
  getEntryForSessionToken(token: string): RemoteResult<UxpStorageEntry>;
  createPersistentToken(entry: UxpStorageEntry): Promise<string>;
  getEntryForPersistentToken(token: string): RemoteResult<UxpStorageEntry>;
}

export type UxpStorageFileTypes = typeof nativeStorage.fileTypes;

export interface UxpStorageErrorConstructor {
  new (message?: string): Error;
  readonly prototype: Error;
}

export type UxpStorageErrors = {
  readonly [K in keyof typeof nativeStorage.errors]: UxpStorageErrorConstructor;
};

export interface UxpPersistentFileStorage {
  readonly Entry: UxpStorageEntryConstructor;
  readonly File: UxpStorageFileConstructor;
  readonly Folder: UxpStorageFolderConstructor;
  readonly FileSystemProvider: UxpStorageFileSystemProviderConstructor;
  readonly LocalFileSystemProvider: UxpStorageLocalFileSystemProviderConstructor;
  readonly domains: typeof nativeStorage.domains;
  readonly formats: typeof nativeStorage.formats;
  readonly modes: typeof nativeStorage.modes;
  readonly types: typeof nativeStorage.types;
  readonly fileTypes: UxpStorageFileTypes;
  readonly errors: UxpStorageErrors;
  readonly localFileSystem: UxpLocalFileSystemProvider;
}

export interface UxpStorageProxyInternals {
  toUxpStorageReference(): Promise<UxpStorageEntryReference>;
}
