export interface FsReadFileOptions {
  readonly encoding?: "utf-8" | "utf-16be" | "utf-16le" | string;
}

export interface FsWriteFileOptions extends FsReadFileOptions {
  readonly flag?: number | string;
  readonly mode?: number | string;
}

export interface FsMkdirOptions {
  readonly recursive?: boolean;
}

export interface FsStats {
  readonly size: number;
  readonly mode?: number;
  readonly atime?: Date;
  readonly mtime?: Date;
  readonly ctime?: Date;
  readonly birthtime?: Date;
  readonly atimeMs?: number;
  readonly mtimeMs?: number;
  readonly ctimeMs?: number;
  readonly birthtimeMs?: number;
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

export interface FS {
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

export const fs: FS;
