import { createUnimplementedNamespace } from "../../../unimplemented-namespace.js";

export interface FsNamespace {
  open(path: string, flag?: string, mode?: string | number): Promise<RemoteFileHandle>;
  readFile(path: string, options?: Record<string, unknown>): Promise<string | ArrayBuffer>;
  writeFile(path: string, data: string | ArrayBuffer | ArrayBufferView, options?: Record<string, unknown>): Promise<number>;
}

export interface RemoteFileHandle {
  read(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{ bytesRead: number; buffer: ArrayBuffer }>;
  write(buffer: ArrayBuffer, offset: number, length: number, position: number): Promise<{ bytesWritten: number; buffer: ArrayBuffer }>;
  close(): Promise<void>;
}

export const fs: FsNamespace = createUnimplementedNamespace("fs");
