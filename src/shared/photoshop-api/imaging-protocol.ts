/**
 * Runtime-neutral protocol for the `photoshop.imaging` bridge module (RFC-0010 Part 2, ADR 0011).
 *
 * imaging is its own module — separate id, separate host adapter, separate handle registry — because
 * `PhotoshopImageData` is a *resource handle* (transient, TTL-pruned, user-disposable) whose lifecycle
 * differs from the persistent Document/Layer handles, and ADR 0004 wants one handle registry per
 * module adapter. Both bridge sides import this file; it carries no concrete `photoshop` code.
 *
 * A `PsImageData` reference uses the shared {@link RemoteReference} envelope with `type` = `"PsImageData"`.
 * Its immutable metadata (width/height/components/... — fixed for the native object's lifetime) rides as
 * a value-object snapshot captured at creation, so the WebView proxy answers metadata locally without
 * per-access RPCs. Pixel bytes cross via the shared binary transport envelope (ADR 0011).
 *
 * See docs/adr/0004 (handle registry), docs/adr/0005 (object classification), docs/adr/0007
 * (executeAsModal), docs/adr/0009 (value registry), docs/adr/0011.
 */

import { registerValueObject } from "./value-objects.js";

export const PHOTOSHOP_IMAGING_MODULE_ID = "photoshop-api/modules/imaging";

/** Remote-reference `type` discriminator for the imageData resource handle. */
export const PS_IMAGE_DATA_TYPE = "PsImageData";

/**
 * Complete set of RPC method names crossing the `photoshop.imaging` bridge.
 *
 * - `imaging.getPixels` / `getLayerMask` / `getSelection` — read pixels; return a handle reference +
 *   metadata snapshot (+ sourceBounds/level where applicable), all wrapped in executeAsModal.
 * - `imaging.putPixels` / `putLayerMask` / `putSelection` — write pixels from an imageData reference.
 * - `imaging.createImageDataFromBuffer` — build a handle from an incoming binary buffer.
 * - `imaging.encodeImageData` — encode a handle to base64/jpeg; result passes through as-is.
 * - `imaging.imageData.getData` / `imaging.imageData.dispose` — per-handle data read and cleanup.
 */
export const PHOTOSHOP_IMAGING_METHOD_NAMES = [
  "imaging.getPixels",
  "imaging.putPixels",
  "imaging.getLayerMask",
  "imaging.putLayerMask",
  "imaging.getSelection",
  "imaging.putSelection",
  "imaging.createImageDataFromBuffer",
  "imaging.encodeImageData",
  "imaging.imageData.getData",
  "imaging.imageData.dispose"
] as const;

export type PhotoshopImagingMethodName = (typeof PHOTOSHOP_IMAGING_METHOD_NAMES)[number];

const PHOTOSHOP_IMAGING_METHOD_SET = new Set<string>(PHOTOSHOP_IMAGING_METHOD_NAMES);

export function isPhotoshopImagingMethodName(method: string): method is PhotoshopImagingMethodName {
  return PHOTOSHOP_IMAGING_METHOD_SET.has(method);
}

export function assertPhotoshopImagingMethodName(
  method: string
): asserts method is PhotoshopImagingMethodName {
  if (!isPhotoshopImagingMethodName(method)) {
    throw new Error(`Unsupported photoshop imaging method: ${method}`);
  }
}

/** Canonical value-kind name for a `PhotoshopImageData` metadata snapshot. */
export const IMAGE_DATA_METADATA_VALUE_KIND = "PsImageDataMetadata";

/**
 * Immutable metadata carried in the value snapshot. These are fixed for the lifetime of the native
 * `PhotoshopImageData`, so a proxy can answer them locally. Both sides copy exactly these fields.
 */
export interface ImageDataMetadata {
  readonly width: number;
  readonly height: number;
  readonly components: number;
  readonly componentSize: 8 | 16 | 32;
  readonly colorSpace: string;
  readonly colorProfile: string;
  readonly hasAlpha: boolean;
  readonly pixelFormat: string;
  readonly chunky: boolean;
  readonly type: string;
}

const IMAGE_DATA_METADATA_FIELDS: readonly (keyof ImageDataMetadata)[] = [
  "width",
  "height",
  "components",
  "componentSize",
  "colorSpace",
  "colorProfile",
  "hasAlpha",
  "pixelFormat",
  "chunky",
  "type"
];

// The metadata mixes numbers, strings, and booleans, so it uses serialize/deserialize overrides
// rather than the flat number-field copy path (which only handles numeric fields).
registerValueObject<ImageDataMetadata>({
  valueKind: IMAGE_DATA_METADATA_VALUE_KIND,
  serialize: (hostObject) => copyMetadata(hostObject),
  deserialize: (data) => copyMetadata(data)
});

function copyMetadata(source: unknown): ImageDataMetadata {
  if (!source || (typeof source !== "object" && typeof source !== "function")) {
    throw new Error("Expected a PhotoshopImageData metadata object.");
  }
  const record = source as Record<string, unknown>;
  return {
    width: readNumber(record, "width"),
    height: readNumber(record, "height"),
    components: readNumber(record, "components"),
    componentSize: readComponentSize(record),
    colorSpace: readString(record, "colorSpace"),
    colorProfile: typeof record.colorProfile === "string" ? record.colorProfile : "",
    hasAlpha: Boolean(record.hasAlpha),
    pixelFormat: readString(record, "pixelFormat"),
    chunky: Boolean(record.chunky),
    type: readString(record, "type")
  };
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number") {
    throw new Error(`PhotoshopImageData metadata field ${field} must be a number.`);
  }
  return value;
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`PhotoshopImageData metadata field ${field} must be a string.`);
  }
  return value;
}

function readComponentSize(record: Record<string, unknown>): 8 | 16 | 32 {
  const value = record.componentSize;
  if (value === 8 || value === 16 || value === 32) {
    return value;
  }
  throw new Error("PhotoshopImageData metadata componentSize must be 8, 16, or 32.");
}

/** Field list exported for the static no-dangling-name test cross-check. */
export { IMAGE_DATA_METADATA_FIELDS };
