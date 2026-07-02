import type { BridgeRemoteReference } from "../types.js";

export const FS_MODULE_ID = "uxp-api/modules/fs";

export const FS_METHOD_NAMES = [
  "readFile",
  "writeFile",
  "open",
  "handleRead",
  "handleWrite",
  "handleClose",
  "lstat",
  "rename",
  "copyFile",
  "unlink",
  "mkdir",
  "rmdir",
  "readdir"
] as const;

export const SUPPORTED_FS_SCHEMES = ["plugin:", "plugin-data:", "plugin-temp:"] as const;

export type FsMethodName = (typeof FS_METHOD_NAMES)[number];

export type FsFileHandleReference = BridgeRemoteReference & {
  readonly kind: "fs.fileHandle";
};

export interface FsReadFileOptions {
  readonly encoding?: string;
}

export interface FsWriteFileOptions {
  readonly flag?: string | number;
  readonly mode?: string | number;
  readonly encoding?: string;
}

export interface FsMkdirOptions {
  readonly recursive?: boolean;
}

export type FsPath = `${"plugin:" | "plugin-data:" | "plugin-temp:"}${string}`;

export type FsTransportData =
  | {
      readonly kind: "text";
      readonly value: string;
    }
  | {
      readonly kind: "bytes";
      readonly encoding: "array";
      readonly value: readonly number[];
    }
  | {
      readonly kind: "bytes";
      readonly encoding: "base64";
      readonly value: string;
    };

export interface FsReadResult {
  readonly bytesRead: number;
  readonly buffer: FsTransportData;
}

export interface FsWriteResult {
  readonly bytesWritten: number;
  readonly buffer: FsTransportData;
}

export interface FsSerializedStats {
  readonly size: number | undefined;
  readonly mode: number | undefined;
  readonly atimeMs: number | undefined;
  readonly mtimeMs: number | undefined;
  readonly ctimeMs: number | undefined;
  readonly birthtimeMs: number | undefined;
  readonly atime: string | undefined;
  readonly mtime: string | undefined;
  readonly ctime: string | undefined;
  readonly birthtime: string | undefined;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
}

export interface FsStats {
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
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface RemoteFileHandle {
  readonly id: string;
  read(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{
    readonly bytesRead: number;
    readonly buffer: ArrayBuffer;
  }>;
  write(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{
    readonly bytesWritten: number;
    readonly buffer: ArrayBuffer;
  }>;
  close(): Promise<void>;
}

export interface FsNamespace {
  readFile(path: string, options?: FsReadFileOptions): Promise<string | ArrayBuffer>;
  writeFile(
    path: string,
    data: string | ArrayBuffer | ArrayBufferView,
    options?: FsWriteFileOptions
  ): Promise<number>;
  open(path: string, flag?: string | number, mode?: string | number): Promise<RemoteFileHandle>;
  lstat(path: string): Promise<FsStats>;
  rename(oldPath: string, newPath: string): Promise<number>;
  copyFile(srcPath: string, destPath: string, flags?: number): Promise<number>;
  unlink(path: string): Promise<number>;
  mkdir(path: string, options?: FsMkdirOptions): Promise<number>;
  rmdir(path: string): Promise<number>;
  readdir(path: string): Promise<readonly string[]>;
}

const FS_METHOD_SET = new Set<string>(FS_METHOD_NAMES);
const INLINE_BYTES_LIMIT = 32 * 1024;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function isFsMethodName(method: string): method is FsMethodName {
  return FS_METHOD_SET.has(method);
}

export function assertFsMethodName(method: string): asserts method is FsMethodName {
  if (!isFsMethodName(method)) {
    throw new Error(`Unsupported fs method: ${method}`);
  }
}

export function createFsFileHandleReference(id: string): FsFileHandleReference {
  return { kind: "fs.fileHandle", id };
}

export function isFsFileHandleReference(value: unknown): value is FsFileHandleReference {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FsFileHandleReference>;
  return candidate.kind === "fs.fileHandle" && typeof candidate.id === "string";
}

export function bytesToFsTransportData(bytes: Uint8Array): FsTransportData {
  if (bytes.byteLength <= INLINE_BYTES_LIMIT) {
    return {
      kind: "bytes",
      encoding: "array",
      value: Array.from(bytes)
    };
  }

  return {
    kind: "bytes",
    encoding: "base64",
    value: bytesToBase64(bytes)
  };
}

export function fsTransportDataToArrayBuffer(data: FsTransportData): ArrayBuffer {
  if (data.kind === "text") {
    throw new Error("Expected binary fs transport data.");
  }

  const bytes = data.encoding === "array" ? Uint8Array.from(data.value) : base64ToBytes(data.value);
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export function isFsTransportData(value: unknown): value is FsTransportData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FsTransportData>;
  if (candidate.kind === "text") {
    return typeof candidate.value === "string";
  }

  if (candidate.kind !== "bytes") {
    return false;
  }

  if (candidate.encoding === "array") {
    return (
      Array.isArray(candidate.value) &&
      candidate.value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    );
  }

  return candidate.encoding === "base64" && typeof candidate.value === "string";
}

export function serializeFsStats(stats: {
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
}): FsSerializedStats {
  return {
    size: stats.size,
    mode: stats.mode,
    atimeMs: stats.atimeMs,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    birthtimeMs: stats.birthtimeMs,
    atime: stats.atime?.toISOString(),
    mtime: stats.mtime?.toISOString(),
    ctime: stats.ctime?.toISOString(),
    birthtime: stats.birthtime?.toISOString(),
    isFile: stats.isFile?.() ?? false,
    isDirectory: stats.isDirectory?.() ?? false,
    isSymbolicLink: stats.isSymbolicLink?.() ?? false
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  let index = 0;

  while (index < bytes.byteLength) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.byteLength ? bytes[index++] : undefined;
    const third = index < bytes.byteLength ? bytes[index++] : undefined;
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += BASE64_ALPHABET[(triplet >> 18) & 63];
    output += BASE64_ALPHABET[(triplet >> 12) & 63];
    output += second === undefined ? "=" : BASE64_ALPHABET[(triplet >> 6) & 63];
    output += third === undefined ? "=" : BASE64_ALPHABET[triplet & 63];
  }

  return output;
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 fs transport data.");
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((normalized.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const first = decodeBase64Char(normalized[index]);
    const second = decodeBase64Char(normalized[index + 1]);
    const third = normalized[index + 2] === "=" ? 0 : decodeBase64Char(normalized[index + 2]);
    const fourth = normalized[index + 3] === "=" ? 0 : decodeBase64Char(normalized[index + 3]);
    const triplet = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 16) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 8) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = triplet & 255;
    }
  }

  return output;
}

function decodeBase64Char(char: string | undefined): number {
  if (!char) {
    throw new Error("Invalid base64 fs transport data.");
  }

  const value = BASE64_ALPHABET.indexOf(char);
  if (value === -1) {
    throw new Error("Invalid base64 fs transport data.");
  }

  return value;
}
