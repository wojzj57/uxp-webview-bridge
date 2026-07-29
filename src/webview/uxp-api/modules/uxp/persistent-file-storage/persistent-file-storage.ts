import {
  fsTransportToArrayBuffer,
  fsValueToTransport,
  type FsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import {
  UXP_MODULE_ID,
  type UxpStorageEntryReference,
  type UxpStorageSerializedEntryMetadata,
  type UxpStorageSymbolNamespace,
  type UxpStorageSymbolReference
} from "@shared/uxp-api/uxp-protocol.js";
import {
  createRemoteResult,
  RemoteOperationScheduler,
  type RemoteResult
} from "@webview/uxp-api/remote/index.js";
import type {
  UxpFileSystemProvider,
  UxpLocalFileSystemProvider,
  UxpPersistentFileStorage,
  UxpStorageCreateEntryWithUrlOptions,
  UxpStorageEntry,
  UxpStorageEntryCopyOptions,
  UxpStorageEntryMetadata,
  UxpStorageEntryMoveOptions,
  UxpStorageFile,
  UxpStorageFilePickerOptions,
  UxpStorageFileReadOptions,
  UxpStorageFileWriteOptions,
  UxpStorageFolder,
  UxpStorageFolderCreateEntryOptions,
  UxpStorageFolderCreateFileOptions,
  UxpStorageFolderPickerOptions,
  UxpStorageFolderRenameEntryOptions,
  UxpStorageProxyInternals,
  UxpStorageSaveFilePickerOptions,
  UxpStorageSymbol
} from "./types.js";

interface UxpPersistentFileStorageRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

const STORAGE_PROXY_SECRET = Symbol("uxp.storage.proxy.secret");

const DOMAIN_NAMES = [
  "appLocalCache",
  "appLocalData",
  "appLocalLibrary",
  "appLocalShared",
  "appLocalTemporary",
  "appRoamingData",
  "appRoamingLibrary",
  "userDesktop",
  "userDocuments",
  "userMusic",
  "userPictures",
  "userVideos"
] as const;

const FORMAT_NAMES = ["binary", "utf8"] as const;
const MODE_NAMES = ["readOnly", "readWrite"] as const;
const TYPE_NAMES = ["file", "folder"] as const;

const ERROR_NAMES = [
  "AbstractMethodInvocationError",
  "DataFileFormatMismatchError",
  "DomainNotSupportedError",
  "EntryExistsError",
  "EntryIsNotAFileError",
  "EntryIsNotAFolderError",
  "EntryIsNotAnEntryError",
  "FileIsReadOnlyError",
  "InvalidFileFormatError",
  "InvalidFileNameError",
  "NotAFileSystemError",
  "OutOfSpaceError",
  "PermissionDeniedError",
  "ProviderMismatchError"
] as const;

export function createUxpPersistentFileStorageNamespace(
  rpc: UxpPersistentFileStorageRpc
): UxpPersistentFileStorage {
  const symbolReferences = new Map<symbol, UxpStorageSymbolReference>();
  const symbolsByKey = new Map<string, symbol>();
  const domains = createSymbolNamespace("domains", DOMAIN_NAMES, symbolReferences, symbolsByKey);
  const formats = createSymbolNamespace("formats", FORMAT_NAMES, symbolReferences, symbolsByKey);
  const modes = createSymbolNamespace("modes", MODE_NAMES, symbolReferences, symbolsByKey);
  const types = createSymbolNamespace("types", TYPE_NAMES, symbolReferences, symbolsByKey);

  let localFileSystem: UxpLocalFileSystemProvider;

  function assertProxyConstructor(secret: unknown): void {
    if (secret !== STORAGE_PROXY_SECRET) {
      throw new TypeError("UXP storage objects are remote proxies and cannot be constructed directly.");
    }
  }

  function reviveSymbol(reference: UxpStorageSymbolReference | undefined): UxpStorageSymbol | undefined {
    if (!reference) {
      return undefined;
    }
    return symbolsByKey.get(symbolKey(reference.namespace, reference.name));
  }

  function entryFromReference(reference: UxpStorageEntryReference): UxpStorageEntry {
    if (reference.type === "file" || reference.entry.isFile) {
      return new WebviewFile(STORAGE_PROXY_SECRET, reference);
    }
    if (reference.type === "folder" || reference.entry.isFolder) {
      return new WebviewFolder(STORAGE_PROXY_SECRET, reference);
    }
    return new WebviewEntry(STORAGE_PROXY_SECRET, reference);
  }

  function fileFromReference(reference: UxpStorageEntryReference): UxpStorageFile {
    const entry = entryFromReference(reference);
    if (!isUxpStorageFile(entry)) {
      throw new Error("Expected a UXP storage File reference.");
    }
    return entry;
  }

  function folderFromReference(reference: UxpStorageEntryReference): UxpStorageFolder {
    const entry = entryFromReference(reference);
    if (!isUxpStorageFolder(entry)) {
      throw new Error("Expected a UXP storage Folder reference.");
    }
    return entry;
  }

  function entriesFromReferences(references: readonly UxpStorageEntryReference[]): UxpStorageEntry[] {
    return references.map((reference) => entryFromReference(reference));
  }

  async function encodeEntryReference(entry: UxpStorageEntry, label: string): Promise<UxpStorageEntryReference> {
    if (!isUxpStorageEntry(entry)) {
      throw new TypeError(`${label} must be a UXP storage Entry proxy.`);
    }
    return (entry as UxpStorageEntry & UxpStorageProxyInternals).toUxpStorageReference();
  }

  async function encodeValue(value: unknown): Promise<unknown> {
    if (typeof value === "symbol") {
      const reference = symbolReferences.get(value);
      if (!reference) {
        throw new TypeError("Unsupported UXP storage symbol.");
      }
      return reference;
    }

    if (isUxpStorageEntry(value)) {
      return (value as UxpStorageEntry & UxpStorageProxyInternals).toUxpStorageReference();
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => encodeValue(item)));
    }

    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) {
          output[key] = await encodeValue(item);
        }
      }
      return output;
    }

    return value;
  }

  async function optionalEncodedArgs(...args: readonly unknown[]): Promise<unknown[]> {
    const output = [...args];
    while (output.length > 0 && output[output.length - 1] === undefined) {
      output.pop();
    }
    return Promise.all(output.map((value) => encodeValue(value)));
  }

  function decodeMetadata(metadata: UxpStorageSerializedEntryMetadata): UxpStorageEntryMetadata {
    return {
      name: metadata.name,
      size: metadata.size,
      dateCreated: metadata.dateCreated === undefined ? undefined : new Date(metadata.dateCreated),
      dateModified: metadata.dateModified === undefined ? undefined : new Date(metadata.dateModified),
      isFile: metadata.isFile,
      isFolder: metadata.isFolder
    };
  }

  class WebviewEntry implements UxpStorageEntry, UxpStorageProxyInternals {
    protected readonly reference: UxpStorageEntryReference;
    protected readonly scheduler = new RemoteOperationScheduler();

    constructor(secret?: typeof STORAGE_PROXY_SECRET, reference?: UxpStorageEntryReference) {
      assertProxyConstructor(secret);
      if (!reference) {
        throw new TypeError("A UXP storage Entry reference is required.");
      }
      this.reference = reference;
    }

    get isEntry(): true {
      return true;
    }

    get isFile(): boolean {
      return this.reference.entry.isFile;
    }

    get isFolder(): boolean {
      return this.reference.entry.isFolder;
    }

    get name(): string {
      return this.reference.entry.name;
    }

    get provider(): UxpLocalFileSystemProvider {
      return localFileSystem;
    }

    get url(): string | undefined {
      return this.reference.entry.url;
    }

    get nativePath(): string | undefined {
      return this.reference.entry.nativePath;
    }

    toString(): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "storage.entry.toString", [this.reference]);
    }

    copyTo(folder: UxpStorageFolder, options?: UxpStorageEntryCopyOptions): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () => {
        const reference = await rpc.call<UxpStorageEntryReference>(
          UXP_MODULE_ID,
          "storage.entry.copyTo",
          [
            this.reference,
            await encodeEntryReference(folder, "uxp.storage.Entry.copyTo folder"),
            ...(await optionalEncodedArgs(options))
          ]
        );
        return entryFromReference(reference);
      });
      return createRemoteResult(promise, this.scheduler, "uxp.storage.Entry.copyTo");
    }

    async moveTo(folder: UxpStorageFolder, options?: UxpStorageEntryMoveOptions): Promise<void> {
      await rpc.call<void>(UXP_MODULE_ID, "storage.entry.moveTo", [
        this.reference,
        await encodeEntryReference(folder, "uxp.storage.Entry.moveTo folder"),
        ...(await optionalEncodedArgs(options))
      ]);
    }

    delete(): Promise<number> {
      return rpc.call<number>(UXP_MODULE_ID, "storage.entry.delete", [this.reference]);
    }

    async getMetadata(): Promise<UxpStorageEntryMetadata> {
      return decodeMetadata(
        await rpc.call<UxpStorageSerializedEntryMetadata>(UXP_MODULE_ID, "storage.entry.getMetadata", [
          this.reference
        ])
      );
    }

    dispose(): Promise<void> {
      return rpc.call<void>(UXP_MODULE_ID, "storage.entry.dispose", [this.reference]);
    }

    toUxpStorageReference(): Promise<UxpStorageEntryReference> {
      return Promise.resolve(this.reference);
    }
  }

  class WebviewFile extends WebviewEntry implements UxpStorageFile {
    constructor(secret?: typeof STORAGE_PROXY_SECRET, reference?: UxpStorageEntryReference) {
      super(secret, reference);
    }

    get isFile(): true {
      return true;
    }

    get isFolder(): false {
      return false;
    }

    get mode(): UxpStorageSymbol | undefined {
      return reviveSymbol(this.reference.entry.mode);
    }

    async read(options?: UxpStorageFileReadOptions): Promise<string | ArrayBuffer> {
      const value = await rpc.call<string | FsTransportData>(UXP_MODULE_ID, "storage.file.read", [
        await this.toUxpStorageReference(),
        ...(await optionalEncodedArgs(options))
      ]);
      return typeof value === "string" || value.kind === "text" ? (typeof value === "string" ? value : value.value) : fsTransportToArrayBuffer(value);
    }

    async write(data: string | ArrayBuffer | ArrayBufferView, options?: UxpStorageFileWriteOptions): Promise<number> {
      return rpc.call<number>(UXP_MODULE_ID, "storage.file.write", [
        await this.toUxpStorageReference(),
        fsValueToTransport(data),
        ...(await optionalEncodedArgs(options))
      ]);
    }
  }

  class WebviewFolder extends WebviewEntry implements UxpStorageFolder {
    constructor(secret?: typeof STORAGE_PROXY_SECRET, reference?: UxpStorageEntryReference) {
      super(secret, reference);
    }

    get isFile(): false {
      return false;
    }

    get isFolder(): true {
      return true;
    }

    async getEntries(): Promise<UxpStorageEntry[]> {
      return entriesFromReferences(
        await rpc.call<UxpStorageEntryReference[]>(UXP_MODULE_ID, "storage.folder.getEntries", [
          await this.toUxpStorageReference()
        ])
      );
    }

    createEntry(name: string, options?: UxpStorageFolderCreateEntryOptions): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.folder.createEntry", [
            await this.toUxpStorageReference(),
            name,
            ...(await optionalEncodedArgs(options))
          ])
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.Folder.createEntry");
    }

    createFile(name: string, options?: UxpStorageFolderCreateFileOptions): RemoteResult<UxpStorageFile> {
      const promise = this.scheduler.run(async () =>
        fileFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.folder.createFile", [
            await this.toUxpStorageReference(),
            name,
            ...(await optionalEncodedArgs(options))
          ])
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.Folder.createFile");
    }

    createFolder(name: string): RemoteResult<UxpStorageFolder> {
      const promise = this.scheduler.run(async () =>
        folderFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.folder.createFolder", [
            await this.toUxpStorageReference(),
            name
          ])
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.Folder.createFolder");
    }

    getEntry(filePath: string): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.folder.getEntry", [
            await this.toUxpStorageReference(),
            filePath
          ])
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.Folder.getEntry");
    }

    async renameEntry(
      entry: UxpStorageEntry,
      newName: string,
      options?: UxpStorageFolderRenameEntryOptions
    ): Promise<void> {
      await rpc.call<void>(UXP_MODULE_ID, "storage.folder.renameEntry", [
        await this.toUxpStorageReference(),
        await encodeEntryReference(entry, "uxp.storage.Folder.renameEntry entry"),
        newName,
        ...(await optionalEncodedArgs(options))
      ]);
    }
  }

  class WebviewFileSystemProvider implements UxpFileSystemProvider {
    protected readonly scheduler = new RemoteOperationScheduler();

    constructor(secret?: typeof STORAGE_PROXY_SECRET) {
      assertProxyConstructor(secret);
    }

    get isFileSystemProvider(): true {
      return true;
    }

    get supportedDomains(): readonly UxpStorageSymbol[] {
      return DOMAIN_NAMES.map((name) => domains[name]);
    }
  }

  class WebviewLocalFileSystemProvider
    extends WebviewFileSystemProvider
    implements UxpLocalFileSystemProvider {
    constructor(secret?: typeof STORAGE_PROXY_SECRET) {
      super(secret);
    }

    async getFileForOpening(options?: UxpStorageFilePickerOptions): Promise<UxpStorageFile | UxpStorageFile[] | null> {
      const value = await rpc.call<UxpStorageEntryReference | UxpStorageEntryReference[] | null>(
        UXP_MODULE_ID,
        "storage.localFileSystem.getFileForOpening",
        await optionalEncodedArgs(options)
      );
      if (value === null) {
        return null;
      }
      return Array.isArray(value) ? value.map((reference) => fileFromReference(reference)) : fileFromReference(value);
    }

    getFileForSaving(
      suggestedName?: string,
      options?: UxpStorageSaveFilePickerOptions
    ): RemoteResult<UxpStorageFile | null> {
      const promise = this.scheduler.run(async () => {
        const value = await rpc.call<UxpStorageEntryReference | null>(
          UXP_MODULE_ID,
          "storage.localFileSystem.getFileForSaving",
          await optionalEncodedArgs(suggestedName, options)
        );
        return value === null ? null : fileFromReference(value);
      });
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getFileForSaving");
    }

    getFolder(options?: UxpStorageFolderPickerOptions): RemoteResult<UxpStorageFolder | null> {
      const promise = this.scheduler.run(async () => {
        const value = await rpc.call<UxpStorageEntryReference | null>(
          UXP_MODULE_ID,
          "storage.localFileSystem.getFolder",
          await optionalEncodedArgs(options)
        );
        return value === null ? null : folderFromReference(value);
      });
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getFolder");
    }

    getTemporaryFolder(): RemoteResult<UxpStorageFolder> {
      const promise = this.scheduler.run(async () =>
        folderFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.localFileSystem.getTemporaryFolder")
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getTemporaryFolder");
    }

    getDataFolder(): RemoteResult<UxpStorageFolder> {
      const promise = this.scheduler.run(async () =>
        folderFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.localFileSystem.getDataFolder")
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getDataFolder");
    }

    getPluginFolder(): RemoteResult<UxpStorageFolder> {
      const promise = this.scheduler.run(async () =>
        folderFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.localFileSystem.getPluginFolder")
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getPluginFolder");
    }

    createEntryWithUrl(
      url: string,
      options?: UxpStorageCreateEntryWithUrlOptions
    ): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(
            UXP_MODULE_ID,
            "storage.localFileSystem.createEntryWithUrl",
            [url, ...(await optionalEncodedArgs(options))]
          )
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.createEntryWithUrl");
    }

    getEntryWithUrl(url: string): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(UXP_MODULE_ID, "storage.localFileSystem.getEntryWithUrl", [url])
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getEntryWithUrl");
    }

    async getFsUrl(entry: UxpStorageEntry): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "storage.localFileSystem.getFsUrl", [
        await encodeEntryReference(entry, "uxp.storage.localFileSystem.getFsUrl entry")
      ]);
    }

    async getNativePath(entry: UxpStorageEntry): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "storage.localFileSystem.getNativePath", [
        await encodeEntryReference(entry, "uxp.storage.localFileSystem.getNativePath entry")
      ]);
    }

    async createSessionToken(entry: UxpStorageEntry): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "storage.localFileSystem.createSessionToken", [
        await encodeEntryReference(entry, "uxp.storage.localFileSystem.createSessionToken entry")
      ]);
    }

    getEntryForSessionToken(token: string): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(
            UXP_MODULE_ID,
            "storage.localFileSystem.getEntryForSessionToken",
            [token]
          )
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getEntryForSessionToken");
    }

    async createPersistentToken(entry: UxpStorageEntry): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "storage.localFileSystem.createPersistentToken", [
        await encodeEntryReference(entry, "uxp.storage.localFileSystem.createPersistentToken entry")
      ]);
    }

    getEntryForPersistentToken(token: string): RemoteResult<UxpStorageEntry> {
      const promise = this.scheduler.run(async () =>
        entryFromReference(
          await rpc.call<UxpStorageEntryReference>(
            UXP_MODULE_ID,
            "storage.localFileSystem.getEntryForPersistentToken",
            [token]
          )
        )
      );
      return createRemoteResult(promise, this.scheduler, "uxp.storage.localFileSystem.getEntryForPersistentToken");
    }
  }



  Object.defineProperty(WebviewFile, "isFile", {
    value: (entry: unknown): entry is UxpStorageFile => isUxpStorageFile(entry)
  });
  Object.defineProperty(WebviewFolder, "isFolder", {
    value: (entry: unknown): entry is UxpStorageFolder => isUxpStorageFolder(entry)
  });
  Object.defineProperty(WebviewFileSystemProvider, "isFileSystemProvider", {
    value: (value: unknown): value is UxpFileSystemProvider => isUxpStorageFileSystemProvider(value)
  });

  localFileSystem = new WebviewLocalFileSystemProvider(STORAGE_PROXY_SECRET);

  return Object.freeze({
    Entry: WebviewEntry,
    File: WebviewFile,
    Folder: WebviewFolder,
    FileSystemProvider: WebviewFileSystemProvider,
    LocalFileSystemProvider: WebviewLocalFileSystemProvider,
    domains,
    formats,
    modes,
    types,
    fileTypes: Object.freeze({
      all: Object.freeze(["*"]),
      images: Object.freeze(["jpg", "jpeg", "png", "gif", "tif", "tiff", "bmp", "webp"]),
      text: Object.freeze(["txt", "text", "md", "csv", "json", "xml"])
    }),
    errors: createErrorNamespace(),
    localFileSystem
  }) as unknown as UxpPersistentFileStorage;
}

function createSymbolNamespace<const TName extends string>(
  namespace: UxpStorageSymbolNamespace,
  names: readonly TName[],
  references: Map<symbol, UxpStorageSymbolReference>,
  symbolsByKey: Map<string, symbol>
): { readonly [K in TName]: symbol } {
  const output = {} as { [K in TName]: symbol };
  for (const name of names) {
    const symbol = Symbol.for(`uxp.storage.${namespace}.${name}`);
    const reference = { kind: "uxp.storage.symbol", namespace, name } as const;
    references.set(symbol, reference);
    symbolsByKey.set(symbolKey(namespace, name), symbol);
    output[name] = symbol;
  }
  return Object.freeze(output);
}

function createErrorNamespace(): Record<string, ErrorConstructor> {
  const output: Record<string, ErrorConstructor> = {};
  for (const name of ERROR_NAMES) {
    output[name] = createNamedError(name);
  }
  return Object.freeze(output);
}

function createNamedError(name: string): ErrorConstructor {
  return {
    [name]: class extends Error {
      constructor(message?: string) {
        super(message);
        this.name = name;
      }
    }
  }[name] as ErrorConstructor;
}

function symbolKey(namespace: UxpStorageSymbolNamespace, name: string): string {
  return `${namespace}.${name}`;
}

function isUxpStorageEntry(value: unknown): value is UxpStorageEntry {
  return !!value && typeof value === "object" && typeof (value as UxpStorageProxyInternals).toUxpStorageReference === "function";
}

function isUxpStorageFile(value: unknown): value is UxpStorageFile {
  return isUxpStorageEntry(value) && (value).isFile === true;
}

function isUxpStorageFolder(value: unknown): value is UxpStorageFolder {
  return isUxpStorageEntry(value) && (value).isFolder === true;
}

function isUxpStorageFileSystemProvider(value: unknown): value is UxpFileSystemProvider {
  return !!value && typeof value === "object" && (value as UxpFileSystemProvider).isFileSystemProvider === true;
}
