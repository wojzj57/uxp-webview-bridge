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
  clipboard: any;
  crypto: any;
  fs: any;
  localStorage: any;
  os: any;
  path: any;
  sessionStorage: any;
  uxp: any;
}

export interface WebviewCdpCaseContext {
  readonly payload: unknown;
  readonly bridge: WebviewCdpBridge;
  readonly assert: WebviewCdpAssert;
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
