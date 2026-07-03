/**
 * UXP script module.
 * @see uxp-document/uxp-api/reference-js/modules/uxp/plugin-manager/script.md
 */
interface Script {
  readonly args: readonly unknown[];
  readonly executionContext: unknown;
  setResult(result: unknown): void;
}

export const script: Script;
