import type { PhotoshopNamespace } from "@webview/photoshop-api/modules/photoshop/types.js";
import type { ClipboardNamespace } from "@webview/uxp-api/global-members/clipboard/types.js";
import type { CryptoNamespace } from "@webview/uxp-api/global-members/crypto/types.js";
import type { LocalStorageNamespace } from "@webview/uxp-api/global-members/local-storage/types.js";
import type { PathNamespace } from "@webview/uxp-api/global-members/path/types.js";
import type { SessionStorageNamespace } from "@webview/uxp-api/global-members/session-storage/types.js";
import type { FsNamespace } from "@webview/uxp-api/modules/fs/types.js";
import type { OsNamespace } from "@webview/uxp-api/modules/os/types.js";
import type { UxpNamespace } from "@webview/uxp-api/modules/uxp/types.js";

export interface WebviewCdpAssert {
  ok(value: unknown, message?: string): void;
  equal(actual: unknown, expected: unknown, message?: string): void;
  match(value: unknown, pattern: RegExp, message?: string): void;
  nonEmptyString(value: unknown, label?: string): void;
  objectHasKeys(value: unknown, keys: readonly string[], label?: string): void;
  functions(value: unknown, names: readonly string[], label?: string): void;
}

export interface WebviewCdpBridge {
  ensureConfigured(): unknown;
  destroy(): Promise<void> | undefined;
  rawCall(operationId: string, module: string, method: string, args?: readonly unknown[]): Promise<unknown>;
  clipboard: ClipboardNamespace;
  crypto: CryptoNamespace;
  fs: FsNamespace;
  localStorage: LocalStorageNamespace;
  os: OsNamespace;
  path: PathNamespace;
  photoshop: PhotoshopNamespace;
  sessionStorage: SessionStorageNamespace;
  uxp: UxpNamespace;
}

export interface WebviewCdpCaseContext {
  readonly target: string;
  readonly payload: unknown;
  readonly hostDiagnostics: Readonly<Record<string, unknown>>;
  readonly bridge: WebviewCdpBridge;
  control(command: string, payload?: unknown): Promise<unknown>;
  readonly assert: WebviewCdpAssert;
  reportDiagnostics(diagnostics: Record<string, unknown>): void;
  skip(reason: string, diagnostics?: Record<string, unknown>): unknown;
}

export interface WebviewCdpCase {
  readonly name: string;
  readonly timeoutMs?: number;
  run(context: WebviewCdpCaseContext): Promise<unknown> | unknown;
}

export function defineWebviewCdpCases<const T extends readonly WebviewCdpCase[]>(cases: T): T {
  return cases;
}
