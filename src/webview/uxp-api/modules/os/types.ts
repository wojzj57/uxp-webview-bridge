import type { os as nativeOs } from "@shared/types/uxp/internal/os.js";

export type OsMethodName = keyof typeof nativeOs & string;
export type CpuInfo = Awaited<ReturnType<typeof nativeOs.cpus>>[number];

export interface OsNamespace {
  platform(): Promise<ReturnType<typeof nativeOs.platform>>;
  release(): Promise<ReturnType<typeof nativeOs.release>>;
  arch(): Promise<ReturnType<typeof nativeOs.arch>>;
  cpus(): Promise<ReturnType<typeof nativeOs.cpus>>;
  totalmem(): Promise<ReturnType<typeof nativeOs.totalmem>>;
  freemem(): Promise<ReturnType<typeof nativeOs.freemem>>;
  homedir(): Promise<ReturnType<typeof nativeOs.homedir>>;
}
