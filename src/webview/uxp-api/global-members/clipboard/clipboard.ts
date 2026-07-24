import { CLIPBOARD_MODULE_ID, type ClipboardTextData } from "@shared/uxp-api/clipboard-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { ClipboardNamespace } from "./types.js";

interface ClipboardRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createClipboardNamespace(rpc: ClipboardRpc): ClipboardNamespace {
  return {
    write: (data) => rpc.call<void>(CLIPBOARD_MODULE_ID, "write", [data]),
    writeText: (text) => rpc.call<void>(CLIPBOARD_MODULE_ID, "writeText", [text]),
    read: () => rpc.call<ClipboardTextData>(CLIPBOARD_MODULE_ID, "read"),
    readText: () => rpc.call<string>(CLIPBOARD_MODULE_ID, "readText")
  };
}

export const clipboard: ClipboardNamespace = createClipboardNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
