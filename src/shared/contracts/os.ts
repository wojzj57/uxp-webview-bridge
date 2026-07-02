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

export type OsMethodName = (typeof OS_METHOD_NAMES)[number];

export interface CpuInfo {
  readonly model: string;
  readonly speed: number;
}

export interface OsNamespace {
  platform(): Promise<string>;
  release(): Promise<string>;
  arch(): Promise<string>;
  cpus(): Promise<readonly CpuInfo[]>;
  totalmem(): Promise<number>;
  freemem(): Promise<number>;
  homedir(): Promise<string>;
}

const OS_METHOD_SET = new Set<string>(OS_METHOD_NAMES);

export function isOsMethodName(method: string): method is OsMethodName {
  return OS_METHOD_SET.has(method);
}

export function assertOsMethodName(method: string): asserts method is OsMethodName {
  if (!isOsMethodName(method)) {
    throw new Error(`Unsupported os method: ${method}`);
  }
}
