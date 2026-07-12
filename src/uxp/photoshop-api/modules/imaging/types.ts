/**
 * Host-side types for the `photoshop.imaging` module.
 *
 * These describe the minimal runtime surface the adapter touches on `require('photoshop').imaging`
 * plus the `PhotoshopImageData` handle it registers. Following the photoshop-module precedent, a
 * narrow local shape is used rather than the full ambient Adobe types, so the adapter only asserts
 * what it actually calls.
 */

import type { PhotoshopImagingMethodName } from "@shared/photoshop-api/imaging-protocol.js";

/** All method names dispatched by this module. */
export type ImagingMethodName = PhotoshopImagingMethodName;

/**
 * Structural `PhotoshopImageData` shape the adapter reads. Metadata fields are immutable for the
 * object's lifetime (captured once into a value snapshot); `getData`/`dispose` are called through.
 * The real object is Adobe's `PhotoshopImageData`.
 */
export interface PhotoshopImageDataLike {
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
  getData(options?: unknown): Promise<Uint8Array | Uint16Array | Float32Array>;
  dispose(): void | Promise<void>;
  [member: string]: unknown;
}

/** A pixel-read result carrying an imageData handle (`getPixels`/`getLayerMask`/`getSelection`). */
export interface ImagingReadResultLike {
  readonly imageData: PhotoshopImageDataLike;
  [member: string]: unknown;
}

/** The imaging surface of `require('photoshop').imaging`. */
export interface PhotoshopImagingModule {
  getPixels(options: unknown): Promise<ImagingReadResultLike>;
  putPixels(options: unknown): Promise<void>;
  getLayerMask(options: unknown): Promise<ImagingReadResultLike>;
  putLayerMask(options: unknown): Promise<void>;
  getSelection(options: unknown): Promise<ImagingReadResultLike>;
  putSelection(options: unknown): Promise<void>;
  createImageDataFromBuffer(
    buffer: Uint8Array | Uint16Array | Float32Array,
    options: unknown
  ): Promise<PhotoshopImageDataLike>;
  encodeImageData(options: unknown): Promise<number[] | string>;
}

/** Options passed to `core.executeAsModal`. */
export interface ExecuteAsModalOptions {
  readonly commandName: string;
}

/** The modal-execution surface of `require('photoshop').core`. */
export interface PhotoshopCore {
  executeAsModal<T>(
    targetFunction: (executionContext: unknown) => Promise<T>,
    options: ExecuteAsModalOptions
  ): Promise<T>;
}

/** The subset of `require('photoshop')` the imaging adapter uses. */
export interface PhotoshopImagingHostModule {
  readonly imaging: PhotoshopImagingModule;
  readonly core: PhotoshopCore;
}
