import {
  FS_MODULE_ID,
  fsTransportToArrayBuffer,
  fsValueToTransport,
  type FsSerializedReadResult,
  type FsSerializedStats,
  type FsSerializedWriteResult,
  type FsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { FsMkdirOptions, FsNamespace, FsReadFileOptions, FsStats, FsWriteFileOptions } from "./types.js";

interface FsRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createFsNamespace(rpc: FsRpc): FsNamespace {
  function readFile(
    path: string,
    options: FsReadFileOptions & { readonly encoding: string }
  ): Promise<string>;
  function readFile(path: string, options?: FsReadFileOptions): Promise<string | ArrayBuffer>;
  async function readFile(
    path: string,
    options?: FsReadFileOptions
  ): Promise<string | ArrayBuffer> {
    const value = await rpc.call<string | FsTransportData>(FS_MODULE_ID, "readFile", [
      path,
      ...optionalArgs(options)
    ]);
    return deserializeReadFileValue(value);
  }

  return {
    readFile,
    writeFile: (path, data, options) =>
      rpc.call<number>(FS_MODULE_ID, "writeFile", [
        path,
        fsValueToTransport(data),
        ...optionalArgs(options)
      ]),
    open: (path, flag, mode) =>
      rpc.call<number>(FS_MODULE_ID, "open", [path, ...optionalArgs(flag, mode)]),
    close: (fd) => rpc.call<number>(FS_MODULE_ID, "close", [fd]),
    async read(fd, buffer, offset, length, position) {
      const result = await rpc.call<FsSerializedReadResult>(FS_MODULE_ID, "read", [
        fd,
        fsValueToTransport(buffer),
        offset,
        length,
        position
      ]);
      const returned = fsTransportToArrayBuffer(result.buffer);
      new Uint8Array(buffer).set(new Uint8Array(returned));
      return { bytesRead: result.bytesRead, buffer };
    },
    async write(fd, buffer, offset, length, position) {
      const result = await rpc.call<FsSerializedWriteResult>(FS_MODULE_ID, "write", [
        fd,
        fsValueToTransport(buffer),
        offset,
        length,
        position
      ]);
      return { bytesWritten: result.bytesWritten, buffer: fsTransportToArrayBuffer(result.buffer) };
    },
    async lstat(path) {
      return deserializeStats(await rpc.call<FsSerializedStats>(FS_MODULE_ID, "lstat", [path]));
    },
    rename: (oldPath, newPath) => rpc.call<number>(FS_MODULE_ID, "rename", [oldPath, newPath]),
    copyFile: (srcPath, destPath, flags) =>
      rpc.call<number>(FS_MODULE_ID, "copyFile", [srcPath, destPath, ...optionalArgs(flags)]),
    unlink: (path) => rpc.call<number>(FS_MODULE_ID, "unlink", [path]),
    mkdir: (path, options) => rpc.call<number>(FS_MODULE_ID, "mkdir", [path, ...optionalArgs(options)]),
    rmdir: (path) => rpc.call<number>(FS_MODULE_ID, "rmdir", [path]),
    readdir: (path) => rpc.call<string[]>(FS_MODULE_ID, "readdir", [path])
  };
}

export const fs: FsNamespace = createFsNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

function deserializeReadFileValue(value: string | FsTransportData): string | ArrayBuffer {
  if (typeof value === "string") {
    return value;
  }

  if (value.kind === "text") {
    return value.value;
  }

  return fsTransportToArrayBuffer(value);
}

function optionalArgs<T extends readonly unknown[]>(...args: T): unknown[] {
  const output = [...args];
  while (output.length > 0 && output[output.length - 1] === undefined) {
    output.pop();
  }
  return output;
}

function deserializeStats(stats: FsSerializedStats): FsStats {
  return {
    size: stats.size,
    mode: stats.mode,
    atimeMs: stats.atimeMs,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
    atime: stats.atimeMs === undefined ? undefined : new Date(stats.atimeMs),
    mtime: stats.mtimeMs === undefined ? undefined : new Date(stats.mtimeMs),
    ctime: stats.ctimeMs === undefined ? undefined : new Date(stats.ctimeMs),
    birthtime: stats.birthtimeMs === undefined ? undefined : new Date(stats.birthtimeMs),
    isFile: () => stats.isFile,
    isDirectory: () => stats.isDirectory,
    isSymbolicLink: () => stats.isSymbolicLink
  };
}

export type { FsMkdirOptions, FsNamespace, FsReadFileOptions, FsStats, FsWriteFileOptions };
