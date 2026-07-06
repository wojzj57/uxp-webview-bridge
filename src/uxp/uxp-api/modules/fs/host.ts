import {
  assertFsProtocolMethodName,
  FS_MODULE_ID,
  fsBytesToTransport,
  fsTransportToArrayBuffer,
  fsTransportToHostValue,
  isFsBinaryTransportData,
  isFsTransportData,
  type FsProtocolMethodName,
  type FsSerializedStats
} from "@shared/uxp-api/fs-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import type { FsHostModule, FsMkdirOptions, FsReadFileOptions, FsStats, FsWriteFileOptions } from "./types.js";

declare const require: (moduleName: "fs") => FsHostModule;

const OWNED_FILE_DESCRIPTORS = new Set<number>();
const FILE_DESCRIPTOR_TIMEOUTS = new Map<number, ReturnType<typeof setTimeout>>();
const FILE_DESCRIPTOR_IDLE_TIMEOUT_MS = 60_000;

export const fsModuleAdapter: UxpModuleAdapter = {
  moduleId: FS_MODULE_ID,
  capability: "fs",
  dispatch: dispatchFsCall,
  destroy: destroyFsAdapter
};

export async function dispatchFsCall(method: string, args: readonly unknown[]): Promise<unknown> {
  assertFsProtocolMethodName(method);

  switch (method) {
    case "readFile":
      return dispatchReadFile(args);
    case "writeFile":
      return dispatchWriteFile(args);
    case "open":
      return dispatchOpen(args);
    case "close":
      return dispatchClose(args);
    case "read":
      return dispatchRead(args);
    case "write":
      return dispatchWrite(args);
    case "lstat":
      return dispatchLstat(args);
    case "rename":
      return dispatchRename(args);
    case "copyFile":
      return dispatchCopyFile(args);
    case "unlink":
      return dispatchSinglePath(method, args);
    case "mkdir":
      return dispatchMkdir(args);
    case "rmdir":
      return dispatchSinglePath(method, args);
    case "readdir":
      return dispatchSinglePath(method, args);
    default:
      return assertNever(method);
  }
}

function destroyFsAdapter(): void {
  if (OWNED_FILE_DESCRIPTORS.size === 0) {
    return;
  }

  const fs = require("fs");
  for (const fd of OWNED_FILE_DESCRIPTORS) {
    try {
      clearFileDescriptorTimeout(fd);
      void fs.close(fd);
    } catch {
      // Best-effort cleanup during bridge shutdown.
    }
  }
  OWNED_FILE_DESCRIPTORS.clear();
}

async function dispatchReadFile(args: readonly unknown[]): Promise<string | ReturnType<typeof fsBytesToTransport>> {
  const [path, options] = expectFsArgs<[string, FsReadFileOptions | undefined]>(
    args,
    1,
    2,
    "fs.readFile"
  );
  assertPath(path, "fs.readFile path");
  assertOptionalReadFileOptions(options, "fs.readFile options");

  const value = await require("fs").readFile(path, options ?? {});
  return typeof value === "string" ? value : fsBytesToTransport(toUint8Array(value));
}

async function dispatchWriteFile(args: readonly unknown[]): Promise<number> {
  const [path, value, options] = expectFsArgs<[string, unknown, FsWriteFileOptions | undefined]>(
    args,
    2,
    3,
    "fs.writeFile"
  );
  assertPath(path, "fs.writeFile path");
  if (!isFsTransportData(value)) {
    throw new Error("fs.writeFile data must be string or binary transport data.");
  }
  assertOptionalWriteFileOptions(options, "fs.writeFile options");

  return require("fs").writeFile(path, fsTransportToHostValue(value), options ?? {});
}

async function dispatchOpen(args: readonly unknown[]): Promise<number> {
  const [path, flag, mode] = expectFsArgs<[string, number | string | undefined, number | string | undefined]>(
    args,
    1,
    3,
    "fs.open"
  );
  assertPath(path, "fs.open path");
  assertOptionalFlag(flag, "fs.open flag");
  assertOptionalMode(mode, "fs.open mode");

  const fd = await require("fs").open(path, flag, mode);
  assertFileDescriptor(fd, "fs.open return value");
  registerFileDescriptor(fd);
  return fd;
}

async function dispatchClose(args: readonly unknown[]): Promise<number> {
  const [fd] = expectFsArgs<[number]>(args, 1, 1, "fs.close");
  assertOwnedFileDescriptor(fd, "fs.close fd");

  const result = await require("fs").close(fd);
  unregisterFileDescriptor(fd);
  return result;
}

async function dispatchRead(args: readonly unknown[]): Promise<{
  readonly bytesRead: number;
  readonly buffer: ReturnType<typeof fsBytesToTransport>;
}> {
  const [fd, buffer, offset, length, position] = expectFsArgs<
    [number, unknown, number, number, number]
  >(args, 5, 5, "fs.read");
  assertOwnedFileDescriptor(fd, "fs.read fd");
  if (!isFsBinaryTransportData(buffer)) {
    throw new Error("fs.read buffer must be binary transport data.");
  }
  assertNonNegativeInteger(offset, "fs.read offset");
  assertNonNegativeInteger(length, "fs.read length");
  assertReadWritePosition(position, "fs.read position");

  refreshFileDescriptorTimeout(fd);
  const result = await require("fs").read(
    fd,
    fsTransportToArrayBuffer(buffer),
    offset,
    length,
    position
  );
  return {
    bytesRead: result.bytesRead,
    buffer: fsBytesToTransport(toUint8Array(result.buffer))
  };
}

async function dispatchWrite(args: readonly unknown[]): Promise<{
  readonly bytesWritten: number;
  readonly buffer: ReturnType<typeof fsBytesToTransport>;
}> {
  const [fd, buffer, offset, length, position] = expectFsArgs<
    [number, unknown, number, number, number]
  >(args, 5, 5, "fs.write");
  assertOwnedFileDescriptor(fd, "fs.write fd");
  if (!isFsBinaryTransportData(buffer)) {
    throw new Error("fs.write buffer must be binary transport data.");
  }
  assertNonNegativeInteger(offset, "fs.write offset");
  assertNonNegativeInteger(length, "fs.write length");
  assertReadWritePosition(position, "fs.write position");

  refreshFileDescriptorTimeout(fd);
  const result = await require("fs").write(
    fd,
    fsTransportToArrayBuffer(buffer),
    offset,
    length,
    position
  );
  return {
    bytesWritten: result.bytesWritten,
    buffer: fsBytesToTransport(toUint8Array(result.buffer))
  };
}

async function dispatchLstat(args: readonly unknown[]): Promise<FsSerializedStats> {
  const [path] = expectFsArgs<[string]>(args, 1, 1, "fs.lstat");
  assertPath(path, "fs.lstat path");
  return serializeStats(await require("fs").lstat(path));
}

async function dispatchRename(args: readonly unknown[]): Promise<number> {
  const [oldPath, newPath] = expectFsArgs<[string, string]>(args, 2, 2, "fs.rename");
  assertPath(oldPath, "fs.rename oldPath");
  assertPath(newPath, "fs.rename newPath");
  return require("fs").rename(oldPath, newPath);
}

async function dispatchCopyFile(args: readonly unknown[]): Promise<number> {
  const [srcPath, destPath, flags] = expectFsArgs<[string, string, number | undefined]>(
    args,
    2,
    3,
    "fs.copyFile"
  );
  assertPath(srcPath, "fs.copyFile srcPath");
  assertPath(destPath, "fs.copyFile destPath");
  if (flags !== undefined && (!Number.isInteger(flags) || flags < 0)) {
    throw new Error("fs.copyFile flags must be a non-negative integer when provided.");
  }
  return require("fs").copyFile(srcPath, destPath, flags ?? 0);
}

async function dispatchMkdir(args: readonly unknown[]): Promise<number> {
  const [path, options] = expectFsArgs<[string, FsMkdirOptions | undefined]>(
    args,
    1,
    2,
    "fs.mkdir"
  );
  assertPath(path, "fs.mkdir path");
  assertOptionalMkdirOptions(options, "fs.mkdir options");
  return require("fs").mkdir(path, options ?? {});
}

async function dispatchSinglePath(
  method: "unlink" | "rmdir" | "readdir",
  args: readonly unknown[]
): Promise<number | string[]> {
  const [path] = expectFsArgs<[string]>(args, 1, 1, `fs.${method}`);
  assertPath(path, `fs.${method} path`);
  return require("fs")[method](path);
}

function serializeStats(stats: FsStats): FsSerializedStats {
  return {
    size: stats.size,
    mode: stats.mode,
    atimeMs: dateLikeToMs(stats.atime, stats.atimeMs),
    mtimeMs: dateLikeToMs(stats.mtime, stats.mtimeMs),
    ctimeMs: dateLikeToMs(stats.ctime, stats.ctimeMs),
    birthtimeMs: dateLikeToMs(stats.birthtime, stats.birthtimeMs),
    isFile: callOptionalStatsPredicate(stats, "isFile"),
    isDirectory: callOptionalStatsPredicate(stats, "isDirectory"),
    isSymbolicLink: callOptionalStatsPredicate(stats, "isSymbolicLink")
  };
}

function expectFsArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

function assertPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalReadFileOptions(
  value: unknown,
  label: string
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object when provided.`);
  }
  assertOptionalString(value.encoding, `${label}.encoding`);
}

function assertOptionalWriteFileOptions(
  value: unknown,
  label: string
): asserts value is FsWriteFileOptions | undefined {
  assertOptionalReadFileOptions(value, label);
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object when provided.`);
  }
  assertOptionalFlag(value.flag, `${label}.flag`);
  assertOptionalMode(value.mode, `${label}.mode`);
}

function assertOptionalMkdirOptions(
  value: unknown,
  label: string
): asserts value is FsMkdirOptions | undefined {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object when provided.`);
  }
  if (value.recursive !== undefined && typeof value.recursive !== "boolean") {
    throw new Error(`${label}.recursive must be a boolean when provided.`);
  }
}

function assertOptionalFlag(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${label} must be a string or number when provided.`);
  }
}

function assertOptionalMode(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${label} must be a string or number when provided.`);
  }
}

function assertFileDescriptor(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertOwnedFileDescriptor(value: unknown, label: string): asserts value is number {
  assertFileDescriptor(value, label);
  if (!OWNED_FILE_DESCRIPTORS.has(value)) {
    throw new Error(`${label} is not an open fs file descriptor owned by this bridge.`);
  }
}

function registerFileDescriptor(fd: number): void {
  OWNED_FILE_DESCRIPTORS.add(fd);
  refreshFileDescriptorTimeout(fd);
}

function unregisterFileDescriptor(fd: number): void {
  clearFileDescriptorTimeout(fd);
  OWNED_FILE_DESCRIPTORS.delete(fd);
}

function refreshFileDescriptorTimeout(fd: number): void {
  clearFileDescriptorTimeout(fd);
  FILE_DESCRIPTOR_TIMEOUTS.set(
    fd,
    setTimeout(() => {
      FILE_DESCRIPTOR_TIMEOUTS.delete(fd);
      if (!OWNED_FILE_DESCRIPTORS.delete(fd)) {
        return;
      }

      try {
        void require("fs").close(fd);
      } catch {
        // Best-effort cleanup for descriptors abandoned by the WebView side.
      }
    }, FILE_DESCRIPTOR_IDLE_TIMEOUT_MS)
  );
}

function clearFileDescriptorTimeout(fd: number): void {
  const timeout = FILE_DESCRIPTOR_TIMEOUTS.get(fd);
  if (timeout !== undefined) {
    clearTimeout(timeout);
    FILE_DESCRIPTOR_TIMEOUTS.delete(fd);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertReadWritePosition(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < -1) {
    throw new Error(`${label} must be -1 or a non-negative integer.`);
  }
}

function assertOptionalString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function dateLikeToMs(date: Date | undefined, fallback: number | undefined): number | undefined {
  if (date instanceof Date) {
    return date.getTime();
  }
  return fallback;
}

function callOptionalStatsPredicate(stats: FsStats, name: keyof FsStats): boolean {
  const predicate = stats[name];
  return typeof predicate === "function" ? Boolean(predicate.call(stats)) : false;
}

function assertNever(method: never): never {
  throw new Error(`Unsupported fs method: ${method as FsProtocolMethodName}`);
}
