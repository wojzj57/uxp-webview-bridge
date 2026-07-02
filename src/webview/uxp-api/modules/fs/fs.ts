import { getBridgeRpcClient } from "../../../runtime.js";
import {
  bytesToFsTransportData,
  createFsFileHandleReference,
  FS_MODULE_ID,
  fsTransportDataToArrayBuffer,
  type FsMkdirOptions,
  type FsNamespace,
  type FsReadFileOptions,
  type FsReadResult,
  type FsSerializedStats,
  type FsStats,
  type FsTransportData,
  type FsWriteFileOptions,
  type FsWriteResult,
  type RemoteFileHandle
} from "../../../../shared/contracts/fs.js";

interface FsRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

class RemoteFsStats implements FsStats {
  readonly size: number | undefined;
  readonly mode: number | undefined;
  readonly atimeMs: number | undefined;
  readonly mtimeMs: number | undefined;
  readonly ctimeMs: number | undefined;
  readonly birthtimeMs: number | undefined;
  readonly atime: Date | undefined;
  readonly mtime: Date | undefined;
  readonly ctime: Date | undefined;
  readonly birthtime: Date | undefined;

  constructor(private readonly serialized: FsSerializedStats) {
    this.size = serialized.size;
    this.mode = serialized.mode;
    this.atimeMs = serialized.atimeMs;
    this.mtimeMs = serialized.mtimeMs;
    this.ctimeMs = serialized.ctimeMs;
    this.birthtimeMs = serialized.birthtimeMs;
    this.atime = parseDate(serialized.atime);
    this.mtime = parseDate(serialized.mtime);
    this.ctime = parseDate(serialized.ctime);
    this.birthtime = parseDate(serialized.birthtime);
  }

  isFile(): boolean {
    return this.serialized.isFile;
  }

  isDirectory(): boolean {
    return this.serialized.isDirectory;
  }

  isSymbolicLink(): boolean {
    return this.serialized.isSymbolicLink;
  }
}

class RemoteFileHandleProxy implements RemoteFileHandle {
  constructor(
    readonly id: string,
    private readonly rpc: FsRpc
  ) {}

  async read(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{
    readonly bytesRead: number;
    readonly buffer: ArrayBuffer;
  }> {
    const result = await this.rpc.call<FsReadResult>(FS_MODULE_ID, "handleRead", [
      createFsFileHandleReference(this.id),
      arrayBufferToTransportData(buffer),
      offset,
      length,
      position
    ]);

    return {
      bytesRead: result.bytesRead,
      buffer: fsTransportDataToArrayBuffer(result.buffer)
    };
  }

  async write(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{
    readonly bytesWritten: number;
    readonly buffer: ArrayBuffer;
  }> {
    const result = await this.rpc.call<FsWriteResult>(FS_MODULE_ID, "handleWrite", [
      createFsFileHandleReference(this.id),
      arrayBufferToTransportData(buffer),
      offset,
      length,
      position
    ]);

    return {
      bytesWritten: result.bytesWritten,
      buffer: fsTransportDataToArrayBuffer(result.buffer)
    };
  }

  close(): Promise<void> {
    return this.rpc.call<void>(FS_MODULE_ID, "handleClose", [createFsFileHandleReference(this.id)]);
  }
}

export function createFsNamespace(rpc: FsRpc): FsNamespace {
  return {
    async readFile(path, options?: FsReadFileOptions) {
      const result = await rpc.call<string | FsTransportData>(FS_MODULE_ID, "readFile", [path, options]);
      return typeof result === "string" ? result : fsTransportDataToArrayBuffer(result);
    },

    writeFile(path, data, options?: FsWriteFileOptions) {
      return rpc.call<number>(FS_MODULE_ID, "writeFile", [path, toFsTransportData(data), options]);
    },

    async open(path, flag?: string | number, mode?: string | number) {
      const handle = await rpc.call<{ readonly id: string }>(FS_MODULE_ID, "open", [path, flag, mode]);
      return new RemoteFileHandleProxy(handle.id, rpc);
    },

    async lstat(path) {
      const result = await rpc.call<FsSerializedStats>(FS_MODULE_ID, "lstat", [path]);
      return new RemoteFsStats(result);
    },

    rename: (oldPath, newPath) => rpc.call<number>(FS_MODULE_ID, "rename", [oldPath, newPath]),
    copyFile: (srcPath, destPath, flags = 0) =>
      rpc.call<number>(FS_MODULE_ID, "copyFile", [srcPath, destPath, flags]),
    unlink: (path) => rpc.call<number>(FS_MODULE_ID, "unlink", [path]),
    mkdir: (path, options?: FsMkdirOptions) => rpc.call<number>(FS_MODULE_ID, "mkdir", [path, options]),
    rmdir: (path) => rpc.call<number>(FS_MODULE_ID, "rmdir", [path]),
    readdir: (path) => rpc.call<readonly string[]>(FS_MODULE_ID, "readdir", [path])
  };
}

export const fs: FsNamespace = createFsNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

function toFsTransportData(data: string | ArrayBuffer | ArrayBufferView): string | FsTransportData {
  if (typeof data === "string") {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return bytesToFsTransportData(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  return arrayBufferToTransportData(data);
}

function arrayBufferToTransportData(buffer: ArrayBuffer): FsTransportData {
  return bytesToFsTransportData(new Uint8Array(buffer));
}

function parseDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}
