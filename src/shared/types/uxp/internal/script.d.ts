/**
 * UXP script APIs used by uxp-webview-bridge.
 */
export interface Script {
  readonly args: readonly unknown[];
  readonly executionContext: unknown;
  setResult(result: unknown): void;
}

export const script: Script;
