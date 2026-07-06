export type PathInput =
  | string
  | {
      readonly nativePath?: string;
      readonly url?: string;
    };

export interface PathParsed {
  readonly root: string;
  readonly dir: string;
  readonly base: string;
  readonly ext: string;
  readonly name: string;
}

export interface PathFormatInput {
  readonly root?: string;
  readonly dir?: string;
  readonly base?: string;
  readonly ext?: string;
  readonly name?: string;
}

export interface PathFlavor {
  readonly sep: Promise<string>;
  readonly delimiter: Promise<string>;
  normalize(path: PathInput): Promise<string>;
  join(...paths: readonly PathInput[]): Promise<string>;
  resolve(...paths: readonly PathInput[]): Promise<string>;
  isAbsolute(path: PathInput): Promise<boolean>;
  relative(from: string, to: string): Promise<string>;
  dirname(path: PathInput): Promise<string>;
  basename(path: PathInput, ext?: string): Promise<string>;
  extname(path: PathInput): Promise<string>;
  parse(path: PathInput): Promise<PathParsed>;
  format(pathObject: PathFormatInput): Promise<string>;
}

export interface PathNamespace extends PathFlavor {
  readonly posix: PathFlavor;
  readonly win32: PathFlavor;
}
