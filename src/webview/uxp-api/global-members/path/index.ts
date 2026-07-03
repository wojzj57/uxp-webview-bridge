export type PathInput =
  | string
  | {
      readonly nativePath?: string;
      readonly url?: string;
      toString?(): string;
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
  readonly sep: string;
  readonly delimiter: string;
  normalize(path: PathInput): string;
  join(...paths: readonly PathInput[]): string;
  resolve(...paths: readonly PathInput[]): string;
  isAbsolute(path: PathInput): boolean;
  relative(from: string, to: string): string;
  dirname(path: PathInput): string;
  basename(path: PathInput, ext?: string): string;
  extname(path: PathInput): string;
  parse(path: PathInput): PathParsed;
  format(pathObject: PathFormatInput): string;
}

export interface PathNamespace extends PathFlavor {
  readonly posix: PathFlavor;
  readonly win32: PathFlavor;
}

type NativePathNamespace = Partial<PathNamespace>;

const nativePath = (globalThis as { readonly path?: NativePathNamespace }).path;
const fallback = createFallbackPathNamespace();

export const path: PathNamespace = nativePath ? wrapNativePath(nativePath) : fallback;

function wrapNativePath(native: NativePathNamespace): PathNamespace {
  const posix = native.posix ? wrapNativeFlavor(native.posix, fallback.posix) : fallback.posix;
  const win32 = native.win32 ? wrapNativeFlavor(native.win32, fallback.win32) : fallback.win32;
  const platformFallback = native.sep === "\\" ? win32 : posix;

  return {
    ...wrapNativeFlavor(native, platformFallback),
    posix,
    win32
  };
}

function wrapNativeFlavor(native: Partial<PathFlavor>, fallbackFlavor: PathFlavor): PathFlavor {
  return {
    sep: typeof native.sep === "string" ? native.sep : fallbackFlavor.sep,
    delimiter: typeof native.delimiter === "string" ? native.delimiter : fallbackFlavor.delimiter,
    normalize: (input) => callNative(native.normalize, fallbackFlavor.normalize, input),
    join: (...inputs) => callNative(native.join, fallbackFlavor.join, ...inputs),
    resolve: (...inputs) => callNative(native.resolve, fallbackFlavor.resolve, ...inputs),
    isAbsolute: (input) => callNative(native.isAbsolute, fallbackFlavor.isAbsolute, input),
    relative: (from, to) => callNative(native.relative, fallbackFlavor.relative, from, to),
    dirname: (input) => callNative(native.dirname, fallbackFlavor.dirname, input),
    basename: (input, ext) =>
      ext === undefined
        ? callNative(native.basename, fallbackFlavor.basename, input)
        : callNative(native.basename, fallbackFlavor.basename, input, ext),
    extname: (input) => callNative(native.extname, fallbackFlavor.extname, input),
    parse: (input) => callNative(native.parse, fallbackFlavor.parse, input),
    format: (pathObject) => callNative(native.format, fallbackFlavor.format, pathObject)
  };
}

function callNative<TArgs extends readonly unknown[], TResult>(
  nativeFn: ((...args: TArgs) => TResult) | undefined,
  fallbackFn: (...args: TArgs) => TResult,
  ...args: TArgs
): TResult {
  return typeof nativeFn === "function" ? nativeFn(...args) : fallbackFn(...args);
}

function createFallbackPathNamespace(): PathNamespace {
  const posix = createFlavor("/");
  const win32 = createFlavor("\\");
  return {
    ...posix,
    posix,
    win32
  };
}

function createFlavor(sep: "/" | "\\"): PathFlavor {
  const delimiter = sep === "\\" ? ";" : ":";

  return {
    sep,
    delimiter,
    normalize(input) {
      const path = toPathString(input);
      if (path.length === 0) {
        return ".";
      }

      const parsedRoot = parseRoot(path, sep);
      const trailing = hasTrailingSeparator(path, sep);
      const segments = normalizeSegments(path.slice(parsedRoot.root.length), sep, !parsedRoot.isAbsolute);
      const body = segments.join(sep);
      const normalized = `${parsedRoot.root}${body}`;
      const output = normalized || (parsedRoot.isAbsolute ? parsedRoot.root : ".");
      return trailing && output !== parsedRoot.root && output !== "." ? `${output}${sep}` : output;
    },
    join(...inputs) {
      assertPathList(inputs, "path.join");
      const joined = inputs.map(toPathString).filter((part) => part.length > 0).join(sep);
      return this.normalize(joined);
    },
    resolve(...inputs) {
      assertPathList(inputs, "path.resolve");
      let resolved = "";
      for (let index = inputs.length - 1; index >= 0; index -= 1) {
        const part = toPathString(inputs[index]);
        if (part.length === 0) {
          continue;
        }
        resolved = resolved ? `${part}${sep}${resolved}` : part;
        if (this.isAbsolute(part)) {
          break;
        }
      }

      if (!this.isAbsolute(resolved)) {
        resolved = `${sep}${resolved}`;
      }

      return this.normalize(resolved);
    },
    isAbsolute(input) {
      return parseRoot(toPathString(input), sep).isAbsolute;
    },
    relative(from, to) {
      assertString(from, "path.relative from");
      assertString(to, "path.relative to");
      const fromResolved = trimTrailingSeparators(this.resolve(from), sep);
      const toResolved = trimTrailingSeparators(this.resolve(to), sep);
      if (fromResolved === toResolved) {
        return "";
      }

      const fromParts = splitPathParts(fromResolved, sep);
      const toParts = splitPathParts(toResolved, sep);
      let sameParts = 0;
      while (
        sameParts < fromParts.length &&
        sameParts < toParts.length &&
        compareSegment(fromParts[sameParts], toParts[sameParts], sep)
      ) {
        sameParts += 1;
      }

      return [
        ...fromParts.slice(sameParts).map(() => ".."),
        ...toParts.slice(sameParts)
      ].join(sep);
    },
    dirname(input) {
      const parsed = this.parse(input);
      if (parsed.dir) {
        return parsed.dir;
      }
      return parsed.root || ".";
    },
    basename(input, ext) {
      const base = this.parse(input).base;
      if (ext !== undefined) {
        assertString(ext, "path.basename ext");
      }
      return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    },
    extname(input) {
      return this.parse(input).ext;
    },
    parse(input) {
      const raw = toPathString(input);
      const normalizedSeparators = normalizeSeparators(raw, sep);
      const rootInfo = parseRoot(normalizedSeparators, sep);
      const withoutTrailing = trimTrailingSeparators(normalizedSeparators, sep);
      const lastSeparatorIndex = withoutTrailing.lastIndexOf(sep);
      const dir =
        lastSeparatorIndex <= rootInfo.root.length - 1
          ? rootInfo.root
          : withoutTrailing.slice(0, lastSeparatorIndex);
      const base =
        lastSeparatorIndex === -1
          ? withoutTrailing
          : withoutTrailing.slice(lastSeparatorIndex + 1);
      const dotIndex = base.lastIndexOf(".");
      const ext = dotIndex > 0 ? base.slice(dotIndex) : "";
      const name = ext ? base.slice(0, -ext.length) : base;

      return {
        root: rootInfo.root,
        dir,
        base,
        ext,
        name
      };
    },
    format(pathObject) {
      if (!pathObject || typeof pathObject !== "object") {
        throw new Error("path.format pathObject must be an object.");
      }

      const dir = pathObject.dir ?? pathObject.root ?? "";
      const base = pathObject.base ?? `${pathObject.name ?? ""}${pathObject.ext ?? ""}`;
      if (!dir) {
        return base;
      }
      return dir.endsWith(sep) ? `${dir}${base}` : `${dir}${sep}${base}`;
    }
  };
}

function toPathString(input: PathInput | undefined): string {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object") {
    if (typeof input.nativePath === "string") {
      return input.nativePath;
    }
    if (typeof input.url === "string") {
      return input.url;
    }
  }

  throw new Error("path argument must be a string or Entry-like object.");
}

function assertPathList(inputs: readonly PathInput[], label: string): void {
  if (inputs.length === 0) {
    return;
  }
  for (const input of inputs) {
    toPathString(input);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function normalizeSegments(path: string, sep: "/" | "\\", allowAboveRoot: boolean): string[] {
  const parts = normalizeSeparators(path, sep).split(sep);
  const output: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (output.length > 0 && output[output.length - 1] !== "..") {
        output.pop();
      } else if (allowAboveRoot) {
        output.push("..");
      }
      continue;
    }
    output.push(part);
  }

  return output;
}

function normalizeSeparators(path: string, sep: "/" | "\\"): string {
  return sep === "\\" ? path.replace(/[\\/]+/g, "\\") : path.replace(/\/+/g, "/");
}

function hasTrailingSeparator(path: string, sep: "/" | "\\"): boolean {
  return normalizeSeparators(path, sep).endsWith(sep);
}

function trimTrailingSeparators(path: string, sep: "/" | "\\"): string {
  let output = normalizeSeparators(path, sep);
  const root = parseRoot(output, sep).root;
  while (output.length > root.length && output.endsWith(sep)) {
    output = output.slice(0, -1);
  }
  return output;
}

function splitPathParts(path: string, sep: "/" | "\\"): string[] {
  const root = parseRoot(path, sep).root;
  return normalizeSegments(path.slice(root.length), sep, false);
}

function compareSegment(left: string | undefined, right: string | undefined, sep: "/" | "\\"): boolean {
  return sep === "\\" ? left?.toLowerCase() === right?.toLowerCase() : left === right;
}

function parseRoot(path: string, sep: "/" | "\\"): { readonly root: string; readonly isAbsolute: boolean } {
  const normalized = normalizeSeparators(path, sep);

  if (sep === "\\") {
    const driveRoot = /^[a-zA-Z]:\\/.exec(normalized);
    if (driveRoot) {
      return { root: driveRoot[0], isAbsolute: true };
    }
    if (/^[a-zA-Z]:$/.test(normalized)) {
      return { root: normalized, isAbsolute: false };
    }
    if (normalized.startsWith("\\\\")) {
      const parts = normalized.split("\\").filter(Boolean);
      if (parts.length >= 2) {
        return { root: `\\\\${parts[0]}\\${parts[1]}\\`, isAbsolute: true };
      }
    }
  }

  if (normalized.startsWith(sep)) {
    return { root: sep, isAbsolute: true };
  }

  return { root: "", isAbsolute: false };
}
