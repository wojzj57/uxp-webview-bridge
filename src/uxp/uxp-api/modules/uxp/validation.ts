import type { BridgeCapabilities } from "../../../../shared/types.js";

export function expectUxpArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

export function assertUxpCapability(
  capabilities: BridgeCapabilities,
  capability: keyof BridgeCapabilities["uxp"]
): void {
  if (!capabilities.uxp[capability]) {
    throw new Error(`uxp ${capability} capability is disabled.`);
  }
}

export function assertStorageKey(value: string, label: string): void {
  assertUxpString(value, label);
  if (value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

export function assertUxpString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

export function assertUxpBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

export function assertOptionalUxpString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}

export function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}
