import { PATH_MODULE_ID, type PathParsedTransport } from "@shared/uxp-api/path-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { PathFlavor, PathFormatInput, PathInput, PathNamespace, PathParsed } from "./types.js";

interface PathRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createPathNamespace(rpc: PathRpc): PathNamespace {
  const platform = createPathFlavor(rpc, "");
  return {
    get sep() {
      return platform.sep;
    },
    get delimiter() {
      return platform.delimiter;
    },
    normalize: platform.normalize,
    join: platform.join,
    resolve: platform.resolve,
    isAbsolute: platform.isAbsolute,
    relative: platform.relative,
    dirname: platform.dirname,
    basename: platform.basename,
    extname: platform.extname,
    parse: platform.parse,
    format: platform.format,
    posix: createPathFlavor(rpc, "posix."),
    win32: createPathFlavor(rpc, "win32.")
  };
}

export const path: PathNamespace = createPathNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

function createPathFlavor(rpc: PathRpc, prefix: "" | "posix." | "win32."): PathFlavor {
  return {
    get sep() {
      return rpc.call<string>(PATH_MODULE_ID, `${prefix}sep`);
    },
    get delimiter() {
      return rpc.call<string>(PATH_MODULE_ID, `${prefix}delimiter`);
    },
    normalize: (input) => rpc.call<string>(PATH_MODULE_ID, `${prefix}normalize`, [toPathString(input)]),
    join: (...inputs) =>
      rpc.call<string>(PATH_MODULE_ID, `${prefix}join`, inputs.map((input) => toPathString(input))),
    resolve: (...inputs) =>
      rpc.call<string>(PATH_MODULE_ID, `${prefix}resolve`, inputs.map((input) => toPathString(input))),
    isAbsolute: (input) => rpc.call<boolean>(PATH_MODULE_ID, `${prefix}isAbsolute`, [toPathString(input)]),
    relative: (from, to) => rpc.call<string>(PATH_MODULE_ID, `${prefix}relative`, [from, to]),
    dirname: (input) => rpc.call<string>(PATH_MODULE_ID, `${prefix}dirname`, [toPathString(input)]),
    basename: (input, ext) =>
      ext === undefined
        ? rpc.call<string>(PATH_MODULE_ID, `${prefix}basename`, [toPathString(input)])
        : rpc.call<string>(PATH_MODULE_ID, `${prefix}basename`, [toPathString(input), ext]),
    extname: (input) => rpc.call<string>(PATH_MODULE_ID, `${prefix}extname`, [toPathString(input)]),
    async parse(input) {
      return deserializeParsed(
        await rpc.call<PathParsedTransport>(PATH_MODULE_ID, `${prefix}parse`, [toPathString(input)])
      );
    },
    format: (pathObject) => rpc.call<string>(PATH_MODULE_ID, `${prefix}format`, [serializeFormatInput(pathObject)])
  };
}

function toPathString(input: PathInput | undefined): string {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    if (typeof input.nativePath === "string") {
      return input.nativePath;
    }
    if (typeof input.url === "string") {
      return input.url;
    }
  }

  throw new Error("path argument must be a string or Entry-like object.");
}

function serializeFormatInput(input: PathFormatInput): PathFormatInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("path.format pathObject must be an object.");
  }

  const output: {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  } = {};

  for (const key of ["root", "dir", "base", "ext", "name"] as const) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`path.format ${key} must be a string when provided.`);
    }
    output[key] = value;
  }

  return output;
}

function deserializeParsed(value: PathParsedTransport): PathParsed {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.root !== "string" ||
    typeof value.dir !== "string" ||
    typeof value.base !== "string" ||
    typeof value.ext !== "string" ||
    typeof value.name !== "string"
  ) {
    throw new Error("path.parse returned invalid path data.");
  }

  return {
    root: value.root,
    dir: value.dir,
    base: value.base,
    ext: value.ext,
    name: value.name
  };
}
