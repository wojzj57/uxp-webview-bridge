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

export interface FsBinaryTransportData {
  readonly kind: "bytes";
  readonly encoding: "array" | "base64";
  readonly value: readonly number[] | string;
}

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
const FS_INLINE_BYTES_LIMIT = 32 * 1024;
const FS_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

  if (ArrayBuffer.isView(value)) {
    return fsBytesToTransport(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }

  return fsBytesToTransport(new Uint8Array(value));
}

export function fsBytesToTransport(bytes: Uint8Array): FsBinaryTransportData {
  if (bytes.byteLength <= FS_INLINE_BYTES_LIMIT) {
    return {
      kind: "bytes",
      encoding: "array",
      value: Array.from(bytes)
    };
  }

  return {
    kind: "bytes",
    encoding: "base64",
    value: fsBytesToBase64(bytes)
  };
}

export function fsTransportToUint8Array(value: FsBinaryTransportData): Uint8Array {
  if (value.encoding === "array") {
    if (!Array.isArray(value.value)) {
      throw new Error("Invalid fs binary transport data.");
    }
    return Uint8Array.from(value.value);
  }

  if (typeof value.value !== "string") {
    throw new Error("Invalid fs binary transport data.");
  }
  return fsBase64ToBytes(value.value);
}

export function fsTransportToArrayBuffer(value: FsBinaryTransportData): ArrayBuffer {
  const bytes = fsTransportToUint8Array(value);
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export function fsTransportToHostValue(value: FsTransportData): string | ArrayBuffer {
  if (value.kind === "text") {
    return value.value;
  }

  return fsTransportToArrayBuffer(value);
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
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<FsBinaryTransportData>;
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

function fsBytesToBase64(bytes: Uint8Array): string {
  let output = "";
  let index = 0;

  while (index < bytes.byteLength) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.byteLength ? bytes[index++] : undefined;
    const third = index < bytes.byteLength ? bytes[index++] : undefined;
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += FS_BASE64_ALPHABET[(triplet >> 18) & 63];
    output += FS_BASE64_ALPHABET[(triplet >> 12) & 63];
    output += second === undefined ? "=" : FS_BASE64_ALPHABET[(triplet >> 6) & 63];
    output += third === undefined ? "=" : FS_BASE64_ALPHABET[triplet & 63];
  }

  return output;
}

function fsBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid fs binary transport data.");
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((normalized.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const first = decodeFsBase64Char(normalized[index]);
    const second = decodeFsBase64Char(normalized[index + 1]);
    const third = normalized[index + 2] === "=" ? 0 : decodeFsBase64Char(normalized[index + 2]);
    const fourth = normalized[index + 3] === "=" ? 0 : decodeFsBase64Char(normalized[index + 3]);
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

function decodeFsBase64Char(char: string | undefined): number {
  if (!char) {
    throw new Error("Invalid fs binary transport data.");
  }

  const value = FS_BASE64_ALPHABET.indexOf(char);
  if (value === -1) {
    throw new Error("Invalid fs binary transport data.");
  }
  return value;
}
