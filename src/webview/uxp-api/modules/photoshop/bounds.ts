/**
 * Decoder for the `ImagingBounds` value object.
 *
 * The UXP host serializes layer bounds into the shared six-field {@link ImagingBoundsTransport}
 * shape; this side reconstructs a plain WebView object from exactly `IMAGING_BOUNDS_FIELDS`, so the
 * two never drift. The result is a value object — no remote handle, no methods, not registered in
 * any identity cache (ADR 0005).
 */

import {
  IMAGING_BOUNDS_FIELDS,
  type ImagingBoundsTransport
} from "@shared/uxp-api/photoshop-protocol.js";
import type { ImagingBounds } from "./types.js";

function isImagingBoundsTransport(value: unknown): value is ImagingBoundsTransport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return IMAGING_BOUNDS_FIELDS.every((field) => typeof record[field] === "number");
}

/**
 * Turn a raw RPC return into an {@link ImagingBounds}. Returns `undefined` (declining) when the
 * value is not a bounds transport, so it composes as a {@link RemoteValueDecoder}.
 */
export function decodeImagingBounds(value: unknown): ImagingBounds | undefined {
  if (!isImagingBoundsTransport(value)) {
    return undefined;
  }
  return {
    left: value.left,
    right: value.right,
    top: value.top,
    bottom: value.bottom,
    width: value.width,
    height: value.height
  };
}
