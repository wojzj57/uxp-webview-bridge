import type { BridgeCapabilities } from "../../../../shared/types.js";
import {
  assertFsMethodName,
  bytesToFsTransportData,
  createFsFileHandleReference,
  FS_MODULE_ID,
  fsTransportDataToArrayBuffer,
  isFsFileHandleReference,
  isFsTransportData,
  serializeFsStats,
  SUPPORTED_FS_SCHEMES,
  type FsMkdirOptions,
  type FsReadFileOptions,
  type FsTransportData,
  type FsWriteFileOptions
} from "../../../../shared/contracts/fs.js";
import type { UxpDispatchContext, UxpModuleAdapter } from "../../../module-registry.js";

declare const require: (moduleName: "fs") => UxpFsModule;

interface UxpFsModule {
  readFile(path: string, options?: FsReadFileOptions): Promise<string | ArrayBuffer>;
  writeFile(
    path: string,
    data: string | ArrayBuffer,
    options?: FsWriteFileOptions
  ): Promise<number>;
  open(path: string, flag?: string | number, mode?: string | number): Promise<number>;
  close(fd: number): Promise<number>;
  read(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<{ readonly bytesRead: number; readonly buffer: ArrayBuffer }>;
  write(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<{ readonly bytesWritten: number; readonly buffer: ArrayBuffer }>;
  lstat(path: string): Promise<UxpFsStats>;
  rename(oldPath: string, newPath: string): Promise<number>;
  copyFile(srcPath: string, destPath: string, flags?: number): Promise<number>;
  unlink(path: string): Promise<number>;
  mkdir(path: string, options?: FsMkdirOptions): Promise<number>;
  rmdir(path: string): Promise<number>;
  readdir(path: string): Promise<readonly string[]>;
}

interface UxpFsStats {
  readonly size?: number;
  readonly mode?: number;
  readonly atimeMs?: number;
  readonly mtimeMs?: number;
  readonly ctimeMs?: number;
  readonly birthtimeMs?: number;
  readonly atime?: Date;
  readonly mtime?: Date;
  readonly ctime?: Date;
  readonly birthtime?: Date;
  isFile?(): boolean;
  isDirectory?(): boolean;
  isSymbolicLink?(): boolean;
}

export interface FsModuleAdapterOptions {
  readonly resourceTimeoutMs?: number;
}

interface FsHandleRecord {
  readonly fd: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_RESOURCE_TIMEOUT_MS = 5 * 60 * 1000;

export function createFsModuleAdapter(options: FsModuleAdapterOptions = {}): UxpModuleAdapter {
  const handles = new Map<string, FsHandleRecord>();
  const resourceTimeoutMs = options.resourceTimeoutMs ?? DEFAULT_RESOURCE_TIMEOUT_MS;

  function scheduleCleanup(id: string, fd: number): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      handles.delete(id);
      void require("fs").close(fd).catch(() => undefined);
    }, resourceTimeoutMs);
  }

  function rememberHandle(fd: number): string {
    const id = `fs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    handles.set(id, {
      fd,
      timeoutId: scheduleCleanup(id, fd)
    });
    return id;
  }

  function getHandle(id: string): FsHandleRecord {
    const record = handles.get(id);
    if (!record) {
      throw new Error(`Unknown fs file handle: ${id}`);
    }

    clearTimeout(record.timeoutId);
    record.timeoutId = scheduleCleanup(id, record.fd);
    return record;
  }

  async function closeHandle(id: string): Promise<void> {
    const record = handles.get(id);
    if (!record) {
      return;
    }

    handles.delete(id);
    clearTimeout(record.timeoutId);
    await require("fs").close(record.fd);
  }

  return {
    moduleId: FS_MODULE_ID,
    dispatch: (method, args, context) =>
      dispatchFsCall({
        method,
        args,
        capabilities: context.capabilities,
        rememberHandle,
        getHandle,
        closeHandle
      }),
    destroy: () => {
      for (const [id, record] of handles) {
        handles.delete(id);
        clearTimeout(record.timeoutId);
        void require("fs").close(record.fd).catch(() => undefined);
      }
    }
  };
}

interface DispatchFsCallOptions {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly capabilities: BridgeCapabilities;
  readonly rememberHandle: (fd: number) => string;
  readonly getHandle: (id: string) => FsHandleRecord;
  readonly closeHandle: (id: string) => Promise<void>;
}

export async function dispatchFsCall(options: DispatchFsCallOptions): Promise<unknown> {
  assertFsMethodName(options.method);

  const fs = require("fs");
  switch (options.method) {
    case "readFile": {
      const [path, readOptions] = expectArgs<[string, FsReadFileOptions | undefined]>(
        options.args,
        1,
        2,
        "fs.readFile"
      );
      assertReadCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      const result = await fs.readFile(path, readOptions);
      return typeof result === "string" ? result : bytesToFsTransportData(new Uint8Array(result));
    }

    case "writeFile": {
      const [path, data, writeOptions] = expectArgs<
        [string, string | FsTransportData, FsWriteFileOptions | undefined]
      >(options.args, 2, 3, "fs.writeFile");
      assertWriteCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      const payload = normalizeWriteData(data);
      return fs.writeFile(path, payload, writeOptions);
    }

    case "open": {
      const [path, flag, mode] = expectArgs<[string, string | number | undefined, string | number | undefined]>(
        options.args,
        1,
        3,
        "fs.open"
      );
      assertOpenCapabilities(flag, options.capabilities);
      assertAllowedPath(path, options.capabilities);
      const fd = await fs.open(path, flag, mode);
      return createFsFileHandleReference(options.rememberHandle(fd));
    }

    case "handleRead": {
      const [handle, buffer, offset, length, position] = expectArgs<
        [unknown, unknown, number, number, number]
      >(options.args, 5, 5, "fs.read");
      assertReadCapability(options.capabilities);
      assertChunkOperationArgs(offset, length, position, "fs.read");
      const fd = getFileDescriptor(handle, options.getHandle);
      const result = await fs.read(fd, expectTransportBuffer(buffer), offset, length, position);
      return {
        bytesRead: result.bytesRead,
        buffer: bytesToFsTransportData(new Uint8Array(result.buffer))
      };
    }

    case "handleWrite": {
      const [handle, buffer, offset, length, position] = expectArgs<
        [unknown, unknown, number, number, number]
      >(options.args, 5, 5, "fs.write");
      assertWriteCapability(options.capabilities);
      assertChunkOperationArgs(offset, length, position, "fs.write");
      const fd = getFileDescriptor(handle, options.getHandle);
      const result = await fs.write(fd, expectTransportBuffer(buffer), offset, length, position);
      return {
        bytesWritten: result.bytesWritten,
        buffer: bytesToFsTransportData(new Uint8Array(result.buffer))
      };
    }

    case "handleClose": {
      const [handle] = expectArgs<[unknown]>(options.args, 1, 1, "fs.close");
      if (!isFsFileHandleReference(handle)) {
        throw new Error("fs.close requires a remote file handle.");
      }
      options.getHandle(handle.id);
      await options.closeHandle(handle.id);
      return undefined;
    }

    case "lstat": {
      const [path] = expectArgs<[string]>(options.args, 1, 1, "fs.lstat");
      assertReadCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      return serializeFsStats(await fs.lstat(path));
    }

    case "rename": {
      const [oldPath, newPath] = expectArgs<[string, string]>(options.args, 2, 2, "fs.rename");
      assertWriteCapability(options.capabilities);
      assertAllowedPath(oldPath, options.capabilities);
      assertAllowedPath(newPath, options.capabilities);
      return fs.rename(oldPath, newPath);
    }

    case "copyFile": {
      const [srcPath, destPath, flags] = expectArgs<[string, string, number | undefined]>(
        options.args,
        2,
        3,
        "fs.copyFile"
      );
      assertReadCapability(options.capabilities);
      assertWriteCapability(options.capabilities);
      if (flags !== undefined && !Number.isInteger(flags)) {
        throw new Error("fs.copyFile flags must be an integer.");
      }
      assertAllowedPath(srcPath, options.capabilities);
      assertAllowedPath(destPath, options.capabilities);
      return fs.copyFile(srcPath, destPath, flags);
    }

    case "unlink": {
      const [path] = expectArgs<[string]>(options.args, 1, 1, "fs.unlink");
      assertWriteCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      return fs.unlink(path);
    }

    case "mkdir": {
      const [path, mkdirOptions] = expectArgs<[string, FsMkdirOptions | undefined]>(
        options.args,
        1,
        2,
        "fs.mkdir"
      );
      assertWriteCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      return fs.mkdir(path, mkdirOptions);
    }

    case "rmdir": {
      const [path] = expectArgs<[string]>(options.args, 1, 1, "fs.rmdir");
      assertWriteCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      return fs.rmdir(path);
    }

    case "readdir": {
      const [path] = expectArgs<[string]>(options.args, 1, 1, "fs.readdir");
      assertReadCapability(options.capabilities);
      assertAllowedPath(path, options.capabilities);
      return fs.readdir(path);
    }
  }
}

function expectArgs<T extends readonly unknown[]>(
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

function assertReadCapability(capabilities: BridgeCapabilities): void {
  if (!capabilities.fs.read) {
    throw new Error("fs read capability is disabled.");
  }
}

function assertWriteCapability(capabilities: BridgeCapabilities): void {
  if (!capabilities.fs.write) {
    throw new Error("fs write capability is disabled.");
  }
}

function assertOpenCapabilities(flag: string | number | undefined, capabilities: BridgeCapabilities): void {
  const normalized = String(flag ?? "r");
  const requiresWrite = /[wa+]/.test(normalized);
  const requiresRead = !/^[wa]/.test(normalized) || normalized.includes("+");

  if (requiresRead) {
    assertReadCapability(capabilities);
  }
  if (requiresWrite) {
    assertWriteCapability(capabilities);
  }
}

function assertAllowedPath(path: string, capabilities: BridgeCapabilities): void {
  if (typeof path !== "string") {
    throw new Error("fs path must be a string.");
  }

  const allowed = capabilities.fs.schemes.some(
    (scheme) => isSupportedFsScheme(scheme) && path.startsWith(scheme)
  );
  if (!allowed) {
    throw new Error(`Unsupported fs path scheme: ${path}`);
  }
}

function isSupportedFsScheme(scheme: string): boolean {
  return SUPPORTED_FS_SCHEMES.includes(scheme as (typeof SUPPORTED_FS_SCHEMES)[number]);
}

function assertChunkOperationArgs(
  offset: number,
  length: number,
  position: number,
  method: string
): void {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`${method} offset must be a non-negative integer.`);
  }
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`${method} length must be a non-negative integer.`);
  }
  if (!Number.isInteger(position) || position < -1) {
    throw new Error(`${method} position must be -1 or a non-negative integer.`);
  }
}

function normalizeWriteData(data: string | FsTransportData): string | ArrayBuffer {
  if (typeof data === "string") {
    return data;
  }

  if (!isFsTransportData(data)) {
    throw new Error("fs.writeFile data must be a string or binary transport data.");
  }

  return fsTransportDataToArrayBuffer(data);
}

function expectTransportBuffer(value: unknown): ArrayBuffer {
  if (!isFsTransportData(value)) {
    throw new Error("fs handle operation requires binary transport data.");
  }

  return fsTransportDataToArrayBuffer(value);
}

function getFileDescriptor(handle: unknown, getHandle: (id: string) => FsHandleRecord): number {
  if (!isFsFileHandleReference(handle)) {
    throw new Error("fs handle operation requires a remote file handle.");
  }

  return getHandle(handle.id).fd;
}
