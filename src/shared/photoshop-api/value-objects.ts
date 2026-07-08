/**
 * Runtime-neutral value-object registry for the `photoshop` module (ADR 0009).
 *
 * A "value object" is a plain, method-less snapshot that crosses the bridge by value (ADR 0005):
 * `ImagingBounds`, `SolidColor`, `Bounds`, ... — never a remote handle. Instead of each type owning
 * an ad-hoc transport shape plus a hand-written host serializer and WebView decoder (as
 * `ImagingBounds` did), every value type registers a {@link ValueObjectSpec} here. Both bridge sides
 * import this file; it carries no concrete `photoshop` implementation.
 *
 * The single stable transport envelope is `{ kind: "uxp.photoshop.value", valueKind, data }`,
 * discriminated by `valueKind`. The host builds it with {@link serializeValue}; the WebView
 * reconstructs a plain object with {@link decodeValue}.
 *
 * See docs/adr/0009-declarative-type-value-collection-registries.md.
 */

import { IMAGING_BOUNDS_FIELDS } from "./photoshop-protocol.js";

/** Stable envelope kind for every value object; `valueKind` selects the concrete spec. */
export const PHOTOSHOP_VALUE_KIND = "uxp.photoshop.value";

/** Transport envelope for a value object. `data` is the spec's plain-object payload. */
export interface PhotoshopValueTransport {
  readonly kind: typeof PHOTOSHOP_VALUE_KIND;
  readonly valueKind: string;
  readonly data: unknown;
}

/**
 * Registration for one value type.
 *
 * The common case declares only `fields`: the host copies exactly those fields from the native DOM
 * object (unwrapping `UnitValue`-like `{ _value }` to a number), and the WebView reconstructs a
 * plain object from exactly those fields, so the two can never drift. A type whose shape is not a
 * flat number-field copy supplies `serialize`/`deserialize` instead (or in addition).
 */
export interface ValueObjectSpec<T = unknown> {
  readonly valueKind: string;
  /** Flat field-copy shape: these keys are copied host-side and reconstructed webview-side. */
  readonly fields?: readonly string[];
  /** Host-side override: map the native DOM object to the transport `data` payload. */
  readonly serialize?: (hostObject: unknown) => unknown;
  /** WebView-side override: map the transport `data` payload back to the value object. */
  readonly deserialize?: (data: unknown) => T;
}

const VALUE_SPECS = new Map<string, ValueObjectSpec>();

/** Register a value-object spec. Throws on a duplicate `valueKind` (registration is a compile-time concern). */
export function registerValueObject<T>(spec: ValueObjectSpec<T>): void {
  if (VALUE_SPECS.has(spec.valueKind)) {
    throw new Error(`Duplicate photoshop value kind: ${spec.valueKind}`);
  }
  VALUE_SPECS.set(spec.valueKind, spec as ValueObjectSpec);
}

/** Look up a registered spec, or throw if the `valueKind` is unknown. */
export function getValueObjectSpec(valueKind: string): ValueObjectSpec {
  const spec = VALUE_SPECS.get(valueKind);
  if (!spec) {
    throw new Error(`Unregistered photoshop value kind: ${valueKind}`);
  }
  return spec;
}

/** Every registered `valueKind` (used by the static no-dangling-name test). */
export function registeredValueKinds(): readonly string[] {
  return [...VALUE_SPECS.keys()];
}

/** True when a raw transport value is a {@link PhotoshopValueTransport} envelope. */
export function isPhotoshopValueTransport(value: unknown): value is PhotoshopValueTransport {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === PHOTOSHOP_VALUE_KIND &&
    typeof (value as { valueKind?: unknown }).valueKind === "string"
  );
}

/**
 * Host side: serialize a native DOM value object into a transport envelope. `fields` are copied
 * (with `UnitValue` unwrap); a `serialize` override, when present, produces the `data` payload.
 */
export function serializeValue(valueKind: string, hostObject: unknown): PhotoshopValueTransport {
  const spec = getValueObjectSpec(valueKind);
  const data = spec.serialize ? spec.serialize(hostObject) : copyFields(spec, hostObject);
  return { kind: PHOTOSHOP_VALUE_KIND, valueKind, data };
}

/**
 * WebView side: reconstruct a value object from its transport envelope. Applies the spec's
 * `deserialize` override if present, otherwise reconstructs a plain object from `fields`.
 */
export function decodeValue<T = unknown>(envelope: PhotoshopValueTransport): T {
  const spec = getValueObjectSpec(envelope.valueKind);
  if (spec.deserialize) {
    return spec.deserialize(envelope.data) as T;
  }
  return reconstructFields(spec, envelope.data) as T;
}

/** Photoshop numeric fields may be `UnitValue`-like `{ _value }`; unwrap to a number. */
export function readMaybeUnit(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && typeof (value as { _value?: unknown })._value === "number") {
    return (value as { _value: number })._value;
  }
  return Number(value);
}

function copyFields(spec: ValueObjectSpec, hostObject: unknown): Record<string, number> {
  const fields = requireFields(spec);
  if (!hostObject || typeof hostObject !== "object") {
    throw new Error(`Expected an object for value kind ${spec.valueKind}.`);
  }
  const source = hostObject as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const field of fields) {
    result[field] = readMaybeUnit(source[field]);
  }
  return result;
}

function reconstructFields(spec: ValueObjectSpec, data: unknown): Record<string, number> {
  const fields = requireFields(spec);
  if (!data || typeof data !== "object") {
    throw new Error(`Expected transport data for value kind ${spec.valueKind}.`);
  }
  const source = data as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const field of fields) {
    const fieldValue = source[field];
    if (typeof fieldValue !== "number") {
      throw new Error(`Value kind ${spec.valueKind} field ${field} must be a number.`);
    }
    result[field] = fieldValue;
  }
  return result;
}

function requireFields(spec: ValueObjectSpec): readonly string[] {
  if (!spec.fields) {
    throw new Error(`Value kind ${spec.valueKind} has neither fields nor a serialize/deserialize override.`);
  }
  return spec.fields;
}

/** Canonical value-kind name for `ImagingBounds` (the first registered value type). */
export const IMAGING_BOUNDS_VALUE_KIND = "ImagingBounds";

registerValueObject({
  valueKind: IMAGING_BOUNDS_VALUE_KIND,
  fields: IMAGING_BOUNDS_FIELDS
});
