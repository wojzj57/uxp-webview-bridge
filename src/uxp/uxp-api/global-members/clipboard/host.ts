import {
  assertClipboardProtocolMethodName,
  CLIPBOARD_MODULE_ID,
  isClipboardTextData,
  type ClipboardTextData
} from "@shared/uxp-api/clipboard-protocol.js";
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import type { ClipboardHost } from "./types.js";

export const clipboardModuleAdapter: UxpModuleAdapter = {
  moduleId: CLIPBOARD_MODULE_ID,
  dispatch: dispatchClipboardCall
};

export async function dispatchClipboardCall(method: string, args: readonly unknown[]): Promise<unknown> {
  assertClipboardProtocolMethodName(method);

  if (method === "write") {
    const [data] = expectClipboardArgs<[ClipboardTextData]>(args, 1, 1, "clipboard.write");
    if (!isClipboardTextData(data)) {
      throw new Error("clipboard.write data must be a string MIME map.");
    }
    await getClipboardHost().write(data);
    return undefined;
  }

  if (method === "writeText") {
    const [text] = expectClipboardArgs<[string]>(args, 1, 1, "clipboard.writeText");
    if (typeof text !== "string") {
      throw new Error("clipboard.writeText text must be a string.");
    }
    await getClipboardHost().writeText(text);
    return undefined;
  }

  if (method === "read") {
    expectClipboardArgs<[]>(args, 0, 0, "clipboard.read");
    const value = await getClipboardHost().read();
    if (!isClipboardTextData(value)) {
      throw new Error("clipboard.read returned invalid string MIME map.");
    }
    return value;
  }

  expectClipboardArgs<[]>(args, 0, 0, "clipboard.readText");
  const value = await getClipboardHost().readText();
  if (typeof value !== "string") {
    throw new Error("clipboard.readText returned a non-string value.");
  }
  return value;
}

function getClipboardHost(): ClipboardHost {
  const clipboard = (globalThis as unknown as { navigator?: { clipboard?: ClipboardHost } }).navigator
    ?.clipboard;
  if (!clipboard) {
    throw new Error("navigator.clipboard is not available.");
  }
  return clipboard;
}

function expectClipboardArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  label: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    const count = minLength === maxLength ? minLength : `${minLength}-${maxLength}`;
    throw new Error(`${label} requires ${count} argument${count === 1 ? "" : "s"}.`);
  }
  return args as unknown as T;
}
