export const OS_MODULE_ID = "uxp-api/modules/os";

export const OS_METHOD_NAMES = [
  "platform",
  "release",
  "arch",
  "cpus",
  "totalmem",
  "freemem",
  "homedir"
] as const;

export type OsProtocolMethodName = (typeof OS_METHOD_NAMES)[number];

const OS_METHOD_SET = new Set<string>(OS_METHOD_NAMES);

export function isOsProtocolMethodName(method: string): method is OsProtocolMethodName {
  return OS_METHOD_SET.has(method);
}

export function assertOsProtocolMethodName(method: string): asserts method is OsProtocolMethodName {
  if (!isOsProtocolMethodName(method)) {
    throw new Error(`Unsupported os method: ${method}`);
  }
}
