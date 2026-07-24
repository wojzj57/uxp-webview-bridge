export const CLIPBOARD_MODULE_ID = "uxp-api/global-members/clipboard";

export const CLIPBOARD_METHOD_NAMES = ["write", "writeText", "read", "readText"] as const;

export type ClipboardProtocolMethodName = (typeof CLIPBOARD_METHOD_NAMES)[number];

export type ClipboardTextData = Record<string, string>;

const CLIPBOARD_METHOD_SET = new Set<string>(CLIPBOARD_METHOD_NAMES);

export function isClipboardProtocolMethodName(
  method: string
): method is ClipboardProtocolMethodName {
  return CLIPBOARD_METHOD_SET.has(method);
}

export function assertClipboardProtocolMethodName(
  method: string
): asserts method is ClipboardProtocolMethodName {
  if (!isClipboardProtocolMethodName(method)) {
    throw new Error(`Unsupported clipboard method: ${method}`);
  }
}

export function isClipboardTextData(value: unknown): value is ClipboardTextData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entryValue]) => key.length > 0 && typeof entryValue === "string"
  );
}
