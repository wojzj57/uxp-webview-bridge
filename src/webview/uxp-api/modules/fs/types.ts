import type { fs as nativeFs } from "@shared/types/uxp/internal/fs.js";

export type FsReadFileOptions = Parameters<typeof nativeFs.readFile>[1];
export type FsWriteFileOptions = Parameters<typeof nativeFs.writeFile>[2];
export type FsMkdirOptions = Parameters<typeof nativeFs.mkdir>[1];
export type FsMethodName = keyof typeof nativeFs;

export interface FsStats {
  readonly size: number;
  readonly mode?: number | undefined;
  readonly atime?: Date | undefined;
  readonly mtime?: Date | undefined;
  readonly ctime?: Date | undefined;
  readonly birthtime?: Date | undefined;
  readonly atimeMs?: number | undefined;
  readonly mtimeMs?: number | undefined;
  readonly ctimeMs?: number | undefined;
  readonly birthtimeMs?: number | undefined;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface FsReadResult {
  readonly bytesRead: number;
  readonly buffer: ArrayBuffer;
}

export interface FsWriteResult {
  readonly bytesWritten: number;
  readonly buffer: ArrayBuffer;
}

export interface FsNamespace {
  readFile(path: string, options: FsReadFileOptions & { readonly encoding: string }): Promise<string>;
  readFile(path: string, options?: FsReadFileOptions): Promise<string | ArrayBuffer>;
  writeFile(
    path: string,
    data: string | ArrayBuffer | ArrayBufferView,
    options?: FsWriteFileOptions
  ): Promise<number>;
  open(path: string, flag?: number | string, mode?: number | string): Promise<number>;
  close(fd: number): Promise<number>;
  read(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<FsReadResult>;
  write(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<FsWriteResult>;
  lstat(path: string): Promise<FsStats>;
  rename(oldPath: string, newPath: string): Promise<number>;
  copyFile(srcPath: string, destPath: string, flags?: number): Promise<number>;
  unlink(path: string): Promise<number>;
  mkdir(path: string, options?: FsMkdirOptions): Promise<number>;
  rmdir(path: string): Promise<number>;
  readdir(path: string): Promise<string[]>;
}
