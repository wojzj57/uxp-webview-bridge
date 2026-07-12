import {
  bytesToTransport,
  isBinaryTransportData,
  transportToArrayBuffer,
  transportToBytes,
  valueToTransport,
  type BinaryTransportData
} from "./binary-transport.js";

export const FS_MODULE_ID = "uxp-api/modules/fs";

export const FS_METHOD_NAMES = [
  "readFile",
  "writeFile",
  "open",
  "close",
  "read",
  "write",
  "lstat",
  "rename",
  "copyFile",
  "unlink",
  "mkdir",
  "rmdir",
  "readdir"
] as const;

export type FsProtocolMethodName = (typeof FS_METHOD_NAMES)[number];

export type FsTransportData =
  | {
      readonly kind: "text";
      readonly value: string;
    }
  | FsBinaryTransportData;

/** fs binary payloads share the runtime-neutral transport envelope (ADR 0011). */
export type FsBinaryTransportData = BinaryTransportData;

export interface FsSerializedStats {
  readonly size: number;
  readonly mode?: number | undefined;
  readonly atimeMs?: number | undefined;
  readonly mtimeMs?: number | undefined;
  readonly ctimeMs?: number | undefined;
  readonly birthtimeMs?: number | undefined;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymbolicLink: boolean;
}

export interface FsSerializedReadResult {
  readonly bytesRead: number;
  readonly buffer: FsBinaryTransportData;
}

export interface FsSerializedWriteResult {
  readonly bytesWritten: number;
  readonly buffer: FsBinaryTransportData;
}

const FS_METHOD_SET = new Set<string>(FS_METHOD_NAMES);

export function isFsProtocolMethodName(method: string): method is FsProtocolMethodName {
  return FS_METHOD_SET.has(method);
}

export function assertFsProtocolMethodName(
  method: string
): asserts method is FsProtocolMethodName {
  if (!isFsProtocolMethodName(method)) {
    throw new Error(`Unsupported fs method: ${method}`);
  }
}

export function fsValueToTransport(
  value: string | ArrayBuffer | ArrayBufferView
): FsTransportData {
  if (typeof value === "string") {
    return { kind: "text", value };
  }

  return valueToTransport(value);
}

export function fsBytesToTransport(bytes: Uint8Array): FsBinaryTransportData {
  return bytesToTransport(bytes);
}

export function fsTransportToUint8Array(value: FsBinaryTransportData): Uint8Array {
  return transportToBytes(value);
}

export function fsTransportToArrayBuffer(value: FsBinaryTransportData): ArrayBuffer {
  return transportToArrayBuffer(value);
}

export function fsTransportToHostValue(value: FsTransportData): string | ArrayBuffer {
  if (value.kind === "text") {
    return value.value;
  }

  return transportToArrayBuffer(value);
}

export function isFsTransportData(value: unknown): value is FsTransportData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FsTransportData>;
  if (candidate.kind === "text") {
    return typeof candidate.value === "string";
  }

  return isFsBinaryTransportData(value);
}

export function isFsBinaryTransportData(value: unknown): value is FsBinaryTransportData {
  return isBinaryTransportData(value);
}
