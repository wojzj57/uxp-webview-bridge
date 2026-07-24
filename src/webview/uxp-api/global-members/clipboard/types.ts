import type { ClipboardTextData } from "@shared/uxp-api/clipboard-protocol.js";

export type { ClipboardTextData };

export interface ClipboardNamespace {
  write(data: ClipboardTextData): Promise<void>;
  writeText(text: string): Promise<void>;
  read(): Promise<ClipboardTextData>;
  readText(): Promise<string>;
}
