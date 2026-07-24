import type { fs as nativeFs } from "@shared/types/uxp/internal/fs.js";

export type FsMethodName = keyof typeof nativeFs & string;
export type FsReadFileOptions = Parameters<typeof nativeFs.readFile>[1];
export type FsWriteFileOptions = Parameters<typeof nativeFs.writeFile>[2];
export type FsMkdirOptions = Parameters<typeof nativeFs.mkdir>[1];
export type FsStats = Awaited<ReturnType<typeof nativeFs.lstat>>;

export interface FsHostModule {
  readFile(path: string, options?: FsReadFileOptions): Promise<string | ArrayBuffer> | string | ArrayBuffer;
  writeFile(
    path: string,
    data: string | ArrayBuffer,
    options?: FsWriteFileOptions
  ): Promise<number> | number;
  open(path: string, flag?: number | string, mode?: number | string): Promise<number> | number;
  close(fd: number): Promise<number> | number;
  read(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<{ readonly bytesRead: number; readonly buffer: ArrayBuffer }> | {
    readonly bytesRead: number;
    readonly buffer: ArrayBuffer;
  };
  write(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number
  ): Promise<{ readonly bytesWritten: number; readonly buffer: ArrayBuffer }> | {
    readonly bytesWritten: number;
    readonly buffer: ArrayBuffer;
  };
  lstat(path: string): Promise<FsStats> | FsStats;
  rename(oldPath: string, newPath: string): Promise<number> | number;
  copyFile(srcPath: string, destPath: string, flags?: number): Promise<number> | number;
  unlink(path: string): Promise<number> | number;
  mkdir(path: string, options?: FsMkdirOptions): Promise<number> | number;
  rmdir(path: string): Promise<number> | number;
  readdir(path: string): Promise<string[]> | string[];
}
