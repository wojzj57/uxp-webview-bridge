export const PATH_MODULE_ID = "uxp-api/global-members/path";

export const PATH_FLAVOR_NAMES = ["path", "posix", "win32"] as const;

export type PathProtocolFlavorName = (typeof PATH_FLAVOR_NAMES)[number];

export const PATH_FLAVOR_METHOD_NAMES = [
  "sep",
  "delimiter",
  "normalize",
  "join",
  "resolve",
  "isAbsolute",
  "relative",
  "dirname",
  "basename",
  "extname",
  "parse",
  "format"
] as const;

export type PathFlavorMethodName = (typeof PATH_FLAVOR_METHOD_NAMES)[number];
export type PathProtocolMethodName =
  | PathFlavorMethodName
  | `posix.${PathFlavorMethodName}`
  | `win32.${PathFlavorMethodName}`;

export interface PathParsedTransport {
  readonly root: string;
  readonly dir: string;
  readonly base: string;
  readonly ext: string;
  readonly name: string;
}

export interface PathFormatTransport {
  readonly root?: string;
  readonly dir?: string;
  readonly base?: string;
  readonly ext?: string;
  readonly name?: string;
}

const PATH_FLAVOR_METHOD_SET = new Set<string>(PATH_FLAVOR_METHOD_NAMES);

export function isPathProtocolMethodName(method: string): method is PathProtocolMethodName {
  const parsed = parsePathProtocolMethod(method);
  return parsed !== undefined;
}

export function assertPathProtocolMethodName(
  method: string
): asserts method is PathProtocolMethodName {
  if (!isPathProtocolMethodName(method)) {
    throw new Error(`Unsupported path method: ${method}`);
  }
}

export function parsePathProtocolMethod(
  method: string
): { readonly flavor: PathProtocolFlavorName; readonly method: PathFlavorMethodName } | undefined {
  const [first, second, ...rest] = method.split(".");
  if (rest.length > 0) {
    return undefined;
  }

  if (second === undefined) {
    return first !== undefined && PATH_FLAVOR_METHOD_SET.has(first)
      ? { flavor: "path", method: first as PathFlavorMethodName }
      : undefined;
  }

  if ((first === "posix" || first === "win32") && PATH_FLAVOR_METHOD_SET.has(second)) {
    return { flavor: first, method: second as PathFlavorMethodName };
  }

  return undefined;
}
