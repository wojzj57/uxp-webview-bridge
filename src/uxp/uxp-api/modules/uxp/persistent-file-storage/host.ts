import {
  fsBytesToTransport,
  fsTransportToHostValue,
  isFsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import type {
  UxpStorageEntryReference,
  UxpStorageEntryType,
  UxpStorageSerializedEntry,
  UxpStorageSerializedEntryMetadata,
  UxpStorageSymbolNamespace,
  UxpStorageSymbolReference
} from "@shared/uxp-api/uxp-protocol.js";
import type {
  UxpPersistentFileStorageHandle,
  UxpPersistentFileStorageHostModule,
  UxpPersistentFileStorageMethodName
} from "./types.js";

declare const require: (moduleName: "uxp") => UxpPersistentFileStorageHostModule;

const PERSISTENT_FILE_STORAGE_HANDLES = new Map<string, UxpPersistentFileStorageHandle>();
const PERSISTENT_FILE_STORAGE_HANDLE_IDS = new WeakMap<object, string>();
const PERSISTENT_FILE_STORAGE_HANDLE_TTL_MS = 10 * 60 * 1000;
let nextPersistentFileStorageHandleId = 1;
let persistentFileStorageApi: UxpPersistentFileStorageHostModule["storage"] | undefined;

export function dispatchUxpPersistentFileStorageCall(
  method: UxpPersistentFileStorageMethodName,
  args: readonly unknown[]
): unknown {
  pruneExpiredHandles();

  switch (method) {
    case "storage.localFileSystem.getFileForOpening":
      return dispatchGetFileForOpening(args);
    case "storage.localFileSystem.getFileForSaving":
      return dispatchGetFileForSaving(args);
    case "storage.localFileSystem.getFolder":
      return dispatchGetFolder(args);
    case "storage.localFileSystem.getTemporaryFolder":
      expectArgs(args, 0, 0, method);
      return serializeFolder(getLocalFileSystem().getTemporaryFolder());
    case "storage.localFileSystem.getDataFolder":
      expectArgs(args, 0, 0, method);
      return serializeFolder(getLocalFileSystem().getDataFolder());
    case "storage.localFileSystem.getPluginFolder":
      expectArgs(args, 0, 0, method);
      return serializeFolder(getLocalFileSystem().getPluginFolder());
    case "storage.localFileSystem.createEntryWithUrl":
      return dispatchCreateEntryWithUrl(args);
    case "storage.localFileSystem.getEntryWithUrl":
      return dispatchGetEntryWithUrl(args);
    case "storage.localFileSystem.getFsUrl":
      return dispatchEntryToStringResult(args, "storage.localFileSystem.getFsUrl", "getFsUrl");
    case "storage.localFileSystem.getNativePath":
      return dispatchEntryToStringResult(args, "storage.localFileSystem.getNativePath", "getNativePath");
    case "storage.localFileSystem.createSessionToken":
      return dispatchEntryToStringResult(args, "storage.localFileSystem.createSessionToken", "createSessionToken");
    case "storage.localFileSystem.getEntryForSessionToken":
      return dispatchTokenToEntry(args, "storage.localFileSystem.getEntryForSessionToken", "getEntryForSessionToken");
    case "storage.localFileSystem.createPersistentToken":
      return dispatchCreatePersistentToken(args);
    case "storage.localFileSystem.getEntryForPersistentToken":
      return dispatchTokenToEntry(args, "storage.localFileSystem.getEntryForPersistentToken", "getEntryForPersistentToken");
    case "storage.entry.dispose":
      return dispatchDispose(args);
    case "storage.entry.toString":
      return dispatchEntryToString(args);
    case "storage.entry.copyTo":
      return dispatchEntryCopyTo(args);
    case "storage.entry.moveTo":
      return dispatchEntryMoveTo(args);
    case "storage.entry.delete":
      return dispatchEntryDelete(args);
    case "storage.entry.getMetadata":
      return dispatchEntryGetMetadata(args);
    case "storage.file.read":
      return dispatchFileRead(args);
    case "storage.file.write":
      return dispatchFileWrite(args);
    case "storage.folder.getEntries":
      return dispatchFolderGetEntries(args);
    case "storage.folder.createEntry":
      return dispatchFolderCreateEntry(args);
    case "storage.folder.createFile":
      return dispatchFolderCreateFile(args);
    case "storage.folder.createFolder":
      return dispatchFolderCreateFolder(args);
    case "storage.folder.getEntry":
      return dispatchFolderGetEntry(args);
    case "storage.folder.renameEntry":
      return dispatchFolderRenameEntry(args);
    default:
      return assertNever(method);
  }
}

export function destroyUxpPersistentFileStorageHandles(): void {
  PERSISTENT_FILE_STORAGE_HANDLES.clear();
  persistentFileStorageApi = undefined;
}

/** Resolve a storage entry for another UXP-host adapter, such as Photoshop `app.open`. */
export function resolveUxpStorageEntryReference(
  reference: unknown,
  expectedType: UxpStorageEntryType = "entry"
): unknown {
  return getEntryValue(reference, expectedType, "UXP storage Entry reference");
}

async function dispatchGetFileForOpening(args: readonly unknown[]): Promise<UxpStorageEntryReference | UxpStorageEntryReference[] | null> {
  expectArgs(args, 0, 1, "storage.localFileSystem.getFileForOpening");
  const options = decodeValue(args[0]);
  const value = await getLocalFileSystem().getFileForOpening(options as never);
  if (value == null) {
    return null;
  }
  return Array.isArray(value) ? value.map((entry) => serializeEntry(entry, "file")) : serializeEntry(value, "file");
}

async function dispatchGetFileForSaving(args: readonly unknown[]): Promise<UxpStorageEntryReference | null> {
  expectArgs(args, 0, 2, "storage.localFileSystem.getFileForSaving");
  assertOptionalString(args[0], "storage.localFileSystem.getFileForSaving suggestedName");
  const value = await callMethod(getLocalFileSystem(), "getFileForSaving", [args[0], decodeValue(args[1])]);
  return value == null ? null : serializeEntry(value, "file");
}

async function dispatchGetFolder(args: readonly unknown[]): Promise<UxpStorageEntryReference | null> {
  expectArgs(args, 0, 1, "storage.localFileSystem.getFolder");
  const value = await getLocalFileSystem().getFolder(decodeValue(args[0]) as never);
  return value == null ? null : serializeEntry(value, "folder");
}

async function dispatchCreateEntryWithUrl(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 1, 2, "storage.localFileSystem.createEntryWithUrl");
  assertNonEmptyString(args[0], "storage.localFileSystem.createEntryWithUrl url");
  return serializeEntry(await getLocalFileSystem().createEntryWithUrl(args[0] as string, decodeValue(args[1]) as never));
}

async function dispatchGetEntryWithUrl(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 1, 1, "storage.localFileSystem.getEntryWithUrl");
  assertNonEmptyString(args[0], "storage.localFileSystem.getEntryWithUrl url");
  return serializeEntry(await getLocalFileSystem().getEntryWithUrl(args[0] as string));
}

function dispatchEntryToStringResult(
  args: readonly unknown[],
  method: string,
  hostMethod: "getFsUrl" | "getNativePath" | "createSessionToken"
): string {
  expectArgs(args, 1, 1, method);
  const entry = getEntryValue(args[0], "entry", `${method} entry`);
  return String(getLocalFileSystem()[hostMethod](entry as never));
}

async function dispatchTokenToEntry(
  args: readonly unknown[],
  method: string,
  hostMethod: "getEntryForSessionToken" | "getEntryForPersistentToken"
): Promise<UxpStorageEntryReference> {
  expectArgs(args, 1, 1, method);
  assertNonEmptyString(args[0], `${method} token`);
  return serializeEntry(await getLocalFileSystem()[hostMethod](args[0] as string));
}

async function dispatchCreatePersistentToken(args: readonly unknown[]): Promise<string> {
  expectArgs(args, 1, 1, "storage.localFileSystem.createPersistentToken");
  return String(await getLocalFileSystem().createPersistentToken(getEntryValue(args[0], "entry", "storage.localFileSystem.createPersistentToken entry") as never));
}

function dispatchDispose(args: readonly unknown[]): void {
  expectArgs(args, 1, 1, "storage.entry.dispose");
  const reference = assertEntryReference(args[0], "storage.entry.dispose entry");
  PERSISTENT_FILE_STORAGE_HANDLES.delete(reference.id);
}

function dispatchEntryToString(args: readonly unknown[]): string {
  expectArgs(args, 1, 1, "storage.entry.toString");
  return String(getEntryValue(args[0], "entry", "storage.entry.toString entry"));
}

async function dispatchEntryCopyTo(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 2, 3, "storage.entry.copyTo");
  const entry = getEntryValue(args[0], "entry", "storage.entry.copyTo entry");
  const folder = getEntryValue(args[1], "folder", "storage.entry.copyTo folder");
  return serializeEntry(await callMethod(entry, "copyTo", [folder, decodeValue(args[2])]));
}

async function dispatchEntryMoveTo(args: readonly unknown[]): Promise<void> {
  expectArgs(args, 2, 3, "storage.entry.moveTo");
  const entry = getEntryValue(args[0], "entry", "storage.entry.moveTo entry");
  const folder = getEntryValue(args[1], "folder", "storage.entry.moveTo folder");
  await callMethod(entry, "moveTo", [folder, decodeValue(args[2])]);
}

async function dispatchEntryDelete(args: readonly unknown[]): Promise<number> {
  expectArgs(args, 1, 1, "storage.entry.delete");
  return Number(await callMethod(getEntryValue(args[0], "entry", "storage.entry.delete entry"), "delete", []));
}

async function dispatchEntryGetMetadata(args: readonly unknown[]): Promise<UxpStorageSerializedEntryMetadata> {
  expectArgs(args, 1, 1, "storage.entry.getMetadata");
  return serializeMetadata(await callMethod(getEntryValue(args[0], "entry", "storage.entry.getMetadata entry"), "getMetadata", []));
}

async function dispatchFileRead(args: readonly unknown[]): Promise<string | ReturnType<typeof fsBytesToTransport>> {
  expectArgs(args, 1, 2, "storage.file.read");
  const value = await callMethod(getEntryValue(args[0], "file", "storage.file.read file"), "read", [decodeValue(args[1])]);
  return typeof value === "string" ? value : fsBytesToTransport(toUint8Array(value as ArrayBuffer | ArrayBufferView));
}

async function dispatchFileWrite(args: readonly unknown[]): Promise<number> {
  expectArgs(args, 2, 3, "storage.file.write");
  if (!isFsTransportData(args[1])) {
    throw new Error("storage.file.write data must be string or binary transport data.");
  }
  return Number(
    await callMethod(getEntryValue(args[0], "file", "storage.file.write file"), "write", [
      fsTransportToHostValue(args[1]),
      decodeValue(args[2])
    ])
  );
}

async function dispatchFolderGetEntries(args: readonly unknown[]): Promise<UxpStorageEntryReference[]> {
  expectArgs(args, 1, 1, "storage.folder.getEntries");
  const entries = await callMethod(getEntryValue(args[0], "folder", "storage.folder.getEntries folder"), "getEntries", []);
  if (!Array.isArray(entries)) {
    throw new Error("storage.folder.getEntries returned a non-array value.");
  }
  return entries.map((entry) => serializeEntry(entry));
}

async function dispatchFolderCreateEntry(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 2, 3, "storage.folder.createEntry");
  assertNonEmptyString(args[1], "storage.folder.createEntry name");
  return serializeEntry(
    await callMethod(getEntryValue(args[0], "folder", "storage.folder.createEntry folder"), "createEntry", [
      args[1],
      decodeValue(args[2])
    ])
  );
}

async function dispatchFolderCreateFile(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 2, 3, "storage.folder.createFile");
  assertNonEmptyString(args[1], "storage.folder.createFile name");
  return serializeEntry(
    await callMethod(getEntryValue(args[0], "folder", "storage.folder.createFile folder"), "createFile", [
      args[1],
      decodeValue(args[2])
    ]),
    "file"
  );
}

async function dispatchFolderCreateFolder(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 2, 2, "storage.folder.createFolder");
  assertNonEmptyString(args[1], "storage.folder.createFolder name");
  return serializeEntry(
    await callMethod(getEntryValue(args[0], "folder", "storage.folder.createFolder folder"), "createFolder", [args[1]]),
    "folder"
  );
}

async function dispatchFolderGetEntry(args: readonly unknown[]): Promise<UxpStorageEntryReference> {
  expectArgs(args, 2, 2, "storage.folder.getEntry");
  assertNonEmptyString(args[1], "storage.folder.getEntry filePath");
  return serializeEntry(
    await callMethod(getEntryValue(args[0], "folder", "storage.folder.getEntry folder"), "getEntry", [args[1]])
  );
}

async function dispatchFolderRenameEntry(args: readonly unknown[]): Promise<void> {
  expectArgs(args, 3, 4, "storage.folder.renameEntry");
  assertNonEmptyString(args[2], "storage.folder.renameEntry newName");
  await callMethod(getEntryValue(args[0], "folder", "storage.folder.renameEntry folder"), "renameEntry", [
    getEntryValue(args[1], "entry", "storage.folder.renameEntry entry"),
    args[2],
    decodeValue(args[3])
  ]);
}

function getLocalFileSystem(): UxpPersistentFileStorageHostModule["storage"]["localFileSystem"] {
  return getStorageApi().localFileSystem;
}

function getStorageApi(): UxpPersistentFileStorageHostModule["storage"] {
  persistentFileStorageApi ??= require("uxp").storage;
  return persistentFileStorageApi;
}

function serializeEntry(value: unknown, expectedType?: UxpStorageEntryType): UxpStorageEntryReference {
  const type = inferEntryType(value);
  if (expectedType && type !== expectedType) {
    throw new Error(`Expected a UXP storage ${expectedType} entry.`);
  }

  if (!value || typeof value !== "object") {
    throw new Error("Expected a UXP storage Entry object.");
  }

  const existingId = PERSISTENT_FILE_STORAGE_HANDLE_IDS.get(value);
  const id = existingId ?? `StorageEntry:${Date.now()}:${nextPersistentFileStorageHandleId++}`;
  if (!existingId) {
    PERSISTENT_FILE_STORAGE_HANDLE_IDS.set(value, id);
  }
  PERSISTENT_FILE_STORAGE_HANDLES.set(id, { type, value, touchedAt: Date.now() });
  return {
    kind: "uxp.storage.entry",
    type,
    id,
    entry: serializeEntrySnapshot(value, type)
  };
}

function serializeFolder(value: Promise<unknown>): Promise<UxpStorageEntryReference> {
  return value.then((folder) => serializeEntry(folder, "folder"));
}

function serializeEntrySnapshot(value: unknown, type: UxpStorageEntryType): UxpStorageSerializedEntry {
  const entry = value as Record<string, unknown>;
  return {
    isEntry: true,
    isFile: type === "file",
    isFolder: type === "folder",
    name: typeof entry.name === "string" ? entry.name : "",
    url: typeof entry.url === "string" ? entry.url : undefined,
    nativePath: typeof entry.nativePath === "string" ? entry.nativePath : undefined,
    mode: serializeKnownSymbol("modes", entry.mode)
  };
}

function serializeMetadata(value: unknown): UxpStorageSerializedEntryMetadata {
  const metadata = value as Record<string, unknown>;
  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    size: typeof metadata.size === "number" ? metadata.size : 0,
    dateCreated: serializeDate(metadata.dateCreated),
    dateModified: serializeDate(metadata.dateModified),
    isFile: metadata.isFile === true,
    isFolder: metadata.isFolder === true
  };
}

function inferEntryType(value: unknown): UxpStorageEntryType {
  const entry = value as { readonly isFile?: unknown; readonly isFolder?: unknown };
  if (entry && entry.isFile === true) {
    return "file";
  }
  if (entry && entry.isFolder === true) {
    return "folder";
  }
  return "entry";
}

function getEntryValue(reference: unknown, expectedType: UxpStorageEntryType, label: string): unknown {
  const entryReference = assertEntryReference(reference, label);
  if (expectedType !== "entry" && entryReference.type !== expectedType) {
    throw new Error(`${label} must reference a UXP storage ${expectedType}.`);
  }

  const handle = PERSISTENT_FILE_STORAGE_HANDLES.get(entryReference.id);
  if (!handle) {
    throw new Error(`Unknown UXP storage entry reference: ${entryReference.id}`);
  }
  if (expectedType !== "entry" && handle.type !== expectedType) {
    throw new Error(`${label} must reference a UXP storage ${expectedType}.`);
  }

  PERSISTENT_FILE_STORAGE_HANDLES.set(entryReference.id, { ...handle, touchedAt: Date.now() });
  return handle.value;
}

function assertEntryReference(value: unknown, label: string): UxpStorageEntryReference {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} must be a UXP storage Entry reference.`);
  }
  const candidate = value as Partial<UxpStorageEntryReference>;
  if (
    candidate.kind !== "uxp.storage.entry" ||
    typeof candidate.id !== "string" ||
    (candidate.type !== "entry" && candidate.type !== "file" && candidate.type !== "folder")
  ) {
    throw new Error(`${label} must be a UXP storage Entry reference.`);
  }
  return candidate as UxpStorageEntryReference;
}

function decodeValue(value: unknown): unknown {
  if (isStorageSymbolReference(value)) {
    return getNativeSymbol(value);
  }

  if (isStorageEntryReference(value)) {
    return getEntryValue(value, "entry", "UXP storage Entry reference");
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = decodeValue(item);
    }
    return output;
  }

  return value;
}

function getNativeSymbol(reference: UxpStorageSymbolReference): symbol {
  const namespace = getStorageApi()[reference.namespace] as Record<string, unknown>;
  const value = namespace[reference.name];
  if (typeof value !== "symbol") {
    throw new Error(`Unsupported UXP storage symbol: ${reference.namespace}.${reference.name}`);
  }
  return value;
}

function serializeKnownSymbol(
  namespace: UxpStorageSymbolNamespace,
  value: unknown
): UxpStorageSymbolReference | undefined {
  if (typeof value !== "symbol") {
    return undefined;
  }
  const nativeNamespace = getStorageApi()[namespace] as Record<string, unknown>;
  for (const [name, symbol] of Object.entries(nativeNamespace)) {
    if (symbol === value) {
      return { kind: "uxp.storage.symbol", namespace, name };
    }
  }
  return undefined;
}

function isStorageSymbolReference(value: unknown): value is UxpStorageSymbolReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<UxpStorageSymbolReference>;
  return (
    candidate.kind === "uxp.storage.symbol" &&
    (candidate.namespace === "domains" ||
      candidate.namespace === "formats" ||
      candidate.namespace === "modes" ||
      candidate.namespace === "types") &&
    typeof candidate.name === "string"
  );
}

function isStorageEntryReference(value: unknown): value is UxpStorageEntryReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (value as Partial<UxpStorageEntryReference>).kind === "uxp.storage.entry";
}

function callMethod(target: unknown, method: string, args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") {
    throw new Error(`Cannot call UXP storage method ${method} on a non-object.`);
  }
  const fn = (target as Record<string, unknown>)[method];
  if (typeof fn !== "function") {
    throw new Error(`UXP storage method ${method} is not available.`);
  }
  return fn.apply(target, trimTrailingUndefined(args));
}

function trimTrailingUndefined(args: readonly unknown[]): unknown[] {
  const output = [...args];
  while (output.length > 0 && output[output.length - 1] === undefined) {
    output.pop();
  }
  return output;
}

function expectArgs(args: readonly unknown[], minLength: number, maxLength: number, method: string): void {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}

function serializeDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  return undefined;
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function pruneExpiredHandles(): void {
  const now = Date.now();
  for (const [id, handle] of PERSISTENT_FILE_STORAGE_HANDLES) {
    if (now - handle.touchedAt > PERSISTENT_FILE_STORAGE_HANDLE_TTL_MS) {
      PERSISTENT_FILE_STORAGE_HANDLES.delete(id);
    }
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp persistent-file-storage method: ${method}`);
}
