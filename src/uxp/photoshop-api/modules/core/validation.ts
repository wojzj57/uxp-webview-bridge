export function expectOptions(args: readonly unknown[], method: string): Record<string, unknown> {
  expectArgs(args, 1, method);
  return assertObject(args[0], `${method} options`);
}

export function expectDocumentOptions(
  args: readonly unknown[],
  method: string
): Record<string, unknown> {
  const options = expectOptions(args, method);
  assertInteger(options.documentID, `${method} options.documentID`);
  return options;
}

export function expectArgs(args: readonly unknown[], length: number, method: string): void {
  if (args.length !== length) {
    throw new Error(`${method} expects ${length} arguments.`);
  }
}

export function expectArgsRange(
  args: readonly unknown[],
  min: number,
  max: number,
  method: string
): void {
  if (args.length < min || args.length > max) {
    throw new Error(`${method} expects ${min}-${max} arguments.`);
  }
}

export function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function assertPositiveNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return number;
}

export function assertColorConversionModel(value: unknown, label: string): number {
  if (value !== 4 && value !== 5 && value !== 6 && value !== 15 && value !== 16) {
    throw new Error(`${label} must be a supported ColorConversionModel value.`);
  }
  return value;
}

export function assertInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

export function assertSize(value: unknown, label: string): void {
  const size = assertObject(value, label);
  assertPositiveNumber(size.width, `${label}.width`);
  assertPositiveNumber(size.height, `${label}.height`);
}
