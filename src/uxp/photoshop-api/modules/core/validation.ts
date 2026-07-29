export function expectOptions(args: readonly unknown[], method: string): Record<string, unknown> {
  expectArgs(args, 1, method);
  return assertObject(args[0], `${method} options`);
}

export function expectDocumentOptions(
  args: readonly unknown[],
  method: string
): Record<string, unknown> {
  const options = expectOptions(args, method);
  assertPositiveInteger(options.documentID, `${method} options.documentID`);
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

export function assertNonNegativeNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return number;
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

export function assertPositiveInteger(value: unknown, label: string): number {
  const integer = assertInteger(value, label);
  if (integer <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return integer;
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

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${label} contains unsupported property ${unknownKey}.`);
  }
}

export function assertPoint(value: unknown, label: string): Record<string, unknown> {
  const point = assertObject(value, label);
  assertKnownKeys(point, ["x", "y"], label);
  assertFiniteNumber(point.x, `${label}.x`);
  assertFiniteNumber(point.y, `${label}.y`);
  return point;
}

export function assertOptionalScheduling(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }
  const scheduling = assertObject(value, label);
  assertKnownKeys(scheduling, ["playLevel", "eventLevel", "timeOut"], label);
  for (const key of ["playLevel", "eventLevel", "timeOut"] as const) {
    if (scheduling[key] !== undefined) {
      assertNonNegativeNumber(scheduling[key], `${label}.${key}`);
    }
  }
}

export function assertSize(value: unknown, label: string): void {
  const size = assertObject(value, label);
  assertPositiveNumber(size.width, `${label}.width`);
  assertPositiveNumber(size.height, `${label}.height`);
}
