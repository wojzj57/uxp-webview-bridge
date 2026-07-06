import type { PathFormatTransport, PathParsedTransport } from "@shared/uxp-api/path-protocol.js";

export interface PathHostFlavor {
  readonly sep: string;
  readonly delimiter: string;
  normalize(path: string): string;
  join(...paths: readonly string[]): string;
  resolve(...paths: readonly string[]): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
  parse(path: string): PathParsedTransport;
  format(pathObject: PathFormatTransport): string;
}

export interface PathHost extends PathHostFlavor {
  readonly posix?: PathHostFlavor;
  readonly win32?: PathHostFlavor;
}
