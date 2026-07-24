/**
 * WebView-facing types for the `photoshop.imaging` remote namespace (RFC-0010 Part 2).
 *
 * These are the proxy shapes seen by WebView callers. Following the photoshop module precedent, the
 * option/result shapes are local structural mirrors of Adobe's imaging types (whose `.d.ts` carries
 * no runtime values and is not reachable through a working path alias), with every `imageData` field
 * retyped to our {@link PsImageData} proxy. `getData` reconstructs a typed array from the metadata's
 * `componentSize`; `dispose` releases the host handle.
 */

/** A rectangle in the imaging coordinate space (Adobe `ImagingBounds2`). */
export interface ImagingRect {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
}

/** A left/top origin + width/height rectangle (Adobe `BoundsSize`). */
export interface ImagingBoundsSize {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A target size; supplying one dimension scales proportionally (Adobe `Size`). */
export interface ImagingSize {
  readonly width?: number;
  readonly height?: number;
}

/**
 * Remote proxy for a Photoshop `PhotoshopImageData` — a transient *resource handle*. Its immutable
 * metadata is answered locally from a snapshot captured at creation (no RPC); `getData` and
 * `dispose` are the only bridge round-trips. Callers should `dispose()` when done to release the
 * host handle before its TTL expires.
 */
export interface PsImageData {
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
  /** Read the pixel bytes as the typed array implied by `componentSize` (8→Uint8, 16→Uint16, 32→Float32). */
  getData(options?: GetDataOptions): Promise<Uint8Array | Uint16Array | Float32Array>;
  /** Release the host handle. A subsequent `getData` rejects with `BridgeRemoteError`. */
  dispose(): Promise<void>;
}

/** Options for {@link PsImageData.getData} (Adobe `GetDataOptions`). */
export interface GetDataOptions {
  readonly chunky?: boolean;
  readonly fullRange?: boolean;
}

/** Options for {@link PhotoshopImaging.getPixels} (Adobe `GetPixelsOptions`). */
export interface GetPixelsOptions {
  readonly documentID?: number;
  readonly layerID?: number;
  readonly sourceBounds?: ImagingRect;
  readonly targetSize?: ImagingSize;
  readonly colorSpace?: string;
  readonly colorProfile?: string;
  readonly componentSize?: -1 | 8 | 16 | 32;
  readonly applyAlpha?: boolean;
}

/** Result of {@link PhotoshopImaging.getPixels}, with `imageData` retyped to {@link PsImageData}. */
export interface GetPixelsResult {
  readonly imageData: PsImageData;
  readonly sourceBounds: ImagingRect;
  readonly level: number;
}

/** Options for {@link PhotoshopImaging.putPixels} (Adobe `PutPixelsOptions`). */
export interface PutPixelsOptions {
  readonly documentID?: number;
  readonly layerID: number;
  readonly imageData: PsImageData;
  readonly replace?: boolean;
  readonly targetBounds?: ImagingBoundsSize | ImagingRect;
  readonly commandName?: string;
}

/** Options for {@link PhotoshopImaging.getLayerMask} (Adobe `GetLayerMaskOptions`). */
export interface GetLayerMaskOptions {
  readonly documentID?: number;
  readonly layerID: number;
  readonly kind?: "user" | "vector";
  readonly sourceBounds?: ImagingRect;
  readonly targetSize?: ImagingSize;
}

/** Result of {@link PhotoshopImaging.getLayerMask}. */
export interface GetLayerMaskResult {
  readonly imageData: PsImageData;
  readonly sourceBounds: ImagingRect;
}

/** Options for {@link PhotoshopImaging.putLayerMask} (Adobe `PutLayerMaskOptions`). */
export interface PutLayerMaskOptions {
  readonly documentID?: number;
  readonly layerID: number;
  readonly kind?: "user";
  readonly imageData: PsImageData;
  readonly replace?: boolean;
  readonly targetBounds?: ImagingBoundsSize | ImagingRect;
  readonly commandName?: string;
}

/** Options for {@link PhotoshopImaging.getSelection} (Adobe `GetSelectionOptions`). */
export interface GetSelectionOptions {
  readonly documentID?: number;
  readonly sourceBounds?: ImagingRect;
  readonly targetSize?: ImagingSize;
}

/** Result of {@link PhotoshopImaging.getSelection}. */
export interface GetSelectionResult {
  readonly imageData: PsImageData;
  readonly sourceBounds: ImagingRect;
}

/** Options for {@link PhotoshopImaging.putSelection} (Adobe `PutSelectionOptions`). */
export interface PutSelectionOptions {
  readonly documentID?: number;
  readonly replace?: boolean;
  readonly imageData: PsImageData;
  readonly targetBounds?: ImagingBoundsSize | ImagingRect;
  readonly commandName?: string;
}

/** Options for {@link PhotoshopImaging.createImageDataFromBuffer} (Adobe `CreateImageDataFromBufferOptions`). */
export interface CreateImageDataFromBufferOptions {
  readonly width: number;
  readonly height: number;
  readonly components: number;
  readonly chunky?: boolean;
  readonly colorProfile?: string;
  readonly colorSpace: string;
  readonly fullRange?: boolean;
}

/** Options for {@link PhotoshopImaging.encodeImageData} (Adobe `EncodeImageDataOptions`). */
export interface EncodeImageDataOptions {
  readonly imageData: PsImageData;
  readonly base64?: boolean;
}

/**
 * The `photoshop.imaging` surface: a proxy over Adobe's `imaging` sub-module. Every pixel-producing
 * call returns a {@link PsImageData} handle; every pixel-consuming call takes one. All real work runs
 * on the UXP host inside `executeAsModal`.
 */
export interface PhotoshopImaging {
  getPixels(options: GetPixelsOptions): Promise<GetPixelsResult>;
  putPixels(options: PutPixelsOptions): Promise<void>;
  getLayerMask(options: GetLayerMaskOptions): Promise<GetLayerMaskResult>;
  putLayerMask(options: PutLayerMaskOptions): Promise<void>;
  getSelection(options: GetSelectionOptions): Promise<GetSelectionResult>;
  putSelection(options: PutSelectionOptions): Promise<void>;
  createImageDataFromBuffer(
    buffer: Uint8Array | Uint16Array | Float32Array,
    options: CreateImageDataFromBufferOptions
  ): Promise<PsImageData>;
  encodeImageData(options: EncodeImageDataOptions): Promise<number[] | string>;
}
