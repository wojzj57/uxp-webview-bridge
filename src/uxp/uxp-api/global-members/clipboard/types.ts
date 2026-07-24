import type { ClipboardTextData } from "@shared/uxp-api/clipboard-protocol.js";

export interface ClipboardHost {
  write(data: ClipboardTextData): Promise<void>;
  writeText(text: string): Promise<void>;
  read(): Promise<unknown>;
  readText(): Promise<unknown>;
}
