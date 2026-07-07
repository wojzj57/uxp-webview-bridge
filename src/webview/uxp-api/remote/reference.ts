import { isRemoteReference, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";

export { isRemoteReference };
export type { RemoteReference };

/**
 * A WebView remote object that can surface its reference envelope for cross-bridge encoding.
 * Implemented by {@link RemoteClass}.
 */
export interface RemoteReferenceHolder {
  toRemoteReference(): Promise<RemoteReference>;
}

/**
 * Domain hook that maps a non-reference argument value to a transport-safe envelope.
 * Return `undefined` to decline; the next encoder (or the default walk) then handles the value.
 * Example: XMP maps a native `Date` to a `uxp.xmp.nativeDate` envelope.
 */
export type RemoteArgEncoder = (value: unknown) => unknown;

/**
 * Domain hook that maps a decoded transport value back to a runtime value.
 * Return `undefined` to decline. Example: XMP maps an `XMPDateTime` reference envelope to an
 * `XMPDateTime` instance (via the identity cache).
 */
export type RemoteValueDecoder = (value: unknown) => unknown;

export function isRemoteReferenceHolder(value: unknown): value is RemoteReferenceHolder {
  return (
    !!value &&
    typeof value === "object" &&
    "toRemoteReference" in value &&
    typeof (value as { toRemoteReference?: unknown }).toRemoteReference === "function"
  );
}

/**
 * Encode call arguments for transport: {@link RemoteClass} instances become reference envelopes,
 * domain `encoders` get first refusal on other values, then plain objects/arrays are walked
 * recursively. Trailing `undefined` arguments are trimmed (matching optional-parameter semantics).
 */
export async function encodeRemoteArgs(
  args: readonly unknown[],
  encoders: readonly RemoteArgEncoder[] = []
): Promise<unknown[]> {
  const encoded = await Promise.all(args.map((arg) => encodeRemoteValue(arg, encoders)));
  return trimTrailingUndefined(encoded);
}

export async function encodeRemoteValue(value: unknown, encoders: readonly RemoteArgEncoder[] = []): Promise<unknown> {
  if (isRemoteReferenceHolder(value)) {
    return value.toRemoteReference();
  }

  for (const encoder of encoders) {
    const encoded = encoder(value);
    if (encoded !== undefined) {
      return encoded;
    }
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => encodeRemoteValue(item, encoders)));
  }

  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nested]) => [key, await encodeRemoteValue(nested, encoders)] as const)
    );
    return Object.fromEntries(entries);
  }

  return value;
}

/**
 * Decode a returned transport value: domain `decoders` get first refusal (e.g. reference envelopes
 * that should become RemoteClass instances or value objects); anything they decline is returned as
 * is. Callers layer their own recursive walk on top when a structured return type needs it.
 */
export function decodeRemoteValue(value: unknown, decoders: readonly RemoteValueDecoder[] = []): unknown {
  for (const decoder of decoders) {
    const decoded = decoder(value);
    if (decoded !== undefined) {
      return decoded;
    }
  }
  return value;
}

function trimTrailingUndefined(values: unknown[]): unknown[] {
  let lastIndex = values.length - 1;
  while (lastIndex >= 0 && values[lastIndex] === undefined) {
    lastIndex -= 1;
  }
  return values.slice(0, lastIndex + 1);
}
