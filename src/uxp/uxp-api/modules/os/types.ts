import type { os as nativeOs } from "@shared/types/uxp/internal/os.js";

export type OsMethodName = keyof typeof nativeOs;
export type CpuInfo = ReturnType<typeof nativeOs.cpus>[number];
