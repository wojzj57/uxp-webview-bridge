/**
 * The `photoshop.imaging` WebView namespace and the {@link PsImageData} resource-handle proxy
 * (RFC-0010 Part 2, ADR 0011).
 *
 * All real imaging work runs on the UXP host; this side is proxies only (`src/webview` must never
 * import `src/uxp`, AGENTS.md). Pixel-producing calls return a handle reference + a metadata value
 * snapshot which this module reconstructs into a `PsImageData`. Pixel-consuming calls swap the
 * caller's `PsImageData` back to its reference before crossing the bridge — the bytes never make the
 * round trip, only the host-side handle id does. `getData` is the single RPC that moves pixels; it
 * reconstructs the typed array implied by `componentSize` from a shared binary transport envelope.
 */

import {
  bytesToTransport,
  transportToBytes,
  type BinaryTransportData
} from "@shared/uxp-api/binary-transport.js";
import {
  IMAGE_DATA_METADATA_VALUE_KIND,
  PHOTOSHOP_IMAGING_MODULE_ID,
  PS_IMAGE_DATA_TYPE,
  type ImageDataMetadata
} from "@shared/photoshop-api/imaging-protocol.js";
import { decodeValue, isPhotoshopValueTransport } from "@shared/photoshop-api/value-objects.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import { isRemoteReference, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import {
  createRemoteResult,
  RemoteOperationScheduler,
  type RemoteResult
} from "@webview/uxp-api/remote/index.js";
import type {
  CreateImageDataFromBufferOptions,
  EncodeImageDataOptions,
  GetDataOptions,
  GetLayerMaskOptions,
  GetLayerMaskResult,
  GetPixelsOptions,
  GetPixelsResult,
  GetSelectionOptions,
  GetSelectionResult,
  PhotoshopImaging,
  PsImageData,
  PutLayerMaskOptions,
  PutPixelsOptions,
  PutSelectionOptions
} from "./types.js";

interface ImagingRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

/** Host transport shape of a pixel-read result: a handle reference + its metadata snapshot. */
interface ImageDataTransport {
  readonly imageData: RemoteReference;
  readonly metadata: unknown;
}

/**
 * Concrete {@link PsImageData}. Metadata is a local snapshot (answered without RPC); `getData` and
 * `dispose` are the only bridge calls. `getData` reconstructs the typed array whose element size
 * matches `componentSize`.
 */
class RemoteImageData implements PsImageData {
  readonly #rpc: ImagingRpc;
  readonly #reference: RemoteReference;
  readonly #metadata: ImageDataMetadata;

  constructor(rpc: ImagingRpc, reference: RemoteReference, metadata: ImageDataMetadata) {
    this.#rpc = rpc;
    this.#reference = reference;
    this.#metadata = metadata;
  }

  /** The underlying handle reference — read by put/encode paths to avoid shipping bytes. */
  get reference(): RemoteReference {
    return this.#reference;
  }

  get width(): number {
    return this.#metadata.width;
  }
  get height(): number {
    return this.#metadata.height;
  }
  get components(): number {
    return this.#metadata.components;
  }
  get componentSize(): 8 | 16 | 32 {
    return this.#metadata.componentSize;
  }
  get colorSpace(): string {
    return this.#metadata.colorSpace;
  }
  get colorProfile(): string {
    return this.#metadata.colorProfile;
  }
  get hasAlpha(): boolean {
    return this.#metadata.hasAlpha;
  }
  get pixelFormat(): string {
    return this.#metadata.pixelFormat;
  }
  get chunky(): boolean {
    return this.#metadata.chunky;
  }
  get type(): string {
    return this.#metadata.type;
  }

  async getData(options?: GetDataOptions): Promise<Uint8Array | Uint16Array | Float32Array> {
    const transport = await this.#rpc.call<BinaryTransportData>(
      PHOTOSHOP_IMAGING_MODULE_ID,
      "imaging.imageData.getData",
      [this.#reference, options]
    );
    return toTypedArray(transportToBytes(transport), this.#metadata.componentSize);
  }

  dispose(): Promise<void> {
    return this.#rpc.call<void>(PHOTOSHOP_IMAGING_MODULE_ID, "imaging.imageData.dispose", [
      this.#reference
    ]);
  }
}

/** Reinterpret raw bytes as the typed array implied by `componentSize` (bytes are little-endian). */
function toTypedArray(bytes: Uint8Array, componentSize: 8 | 16 | 32): Uint8Array | Uint16Array | Float32Array {
  if (componentSize === 8) {
    return bytes;
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return componentSize === 16 ? new Uint16Array(buffer) : new Float32Array(buffer);
}

export function createImagingNamespace(rpc: ImagingRpc): PhotoshopImaging {
  const scheduler = new RemoteOperationScheduler();

  function decodeImageData(raw: unknown): PsImageData {
    if (!raw || typeof raw !== "object") {
      throw new Error("Expected an imageData transport result.");
    }
    const transport = raw as ImageDataTransport;
    if (!isRemoteReference(transport.imageData) || transport.imageData.type !== PS_IMAGE_DATA_TYPE) {
      throw new Error("Expected a PsImageData reference envelope.");
    }
    if (!isPhotoshopValueTransport(transport.metadata) || transport.metadata.valueKind !== IMAGE_DATA_METADATA_VALUE_KIND) {
      throw new Error("Expected a PsImageData metadata value envelope.");
    }
    const metadata = decodeValue<ImageDataMetadata>(transport.metadata);
    return new RemoteImageData(rpc, transport.imageData, metadata);
  }

  /** Swap a caller's `PsImageData` in an options bag for its underlying handle reference. */
  function withImageDataReference<T extends { imageData: PsImageData }>(
    options: T
  ): Omit<T, "imageData"> & { imageData: RemoteReference } {
    const { imageData, ...rest } = options;
    if (!(imageData instanceof RemoteImageData)) {
      throw new Error("imageData must be a PsImageData produced by this bridge.");
    }
    return { ...(rest), imageData: imageData.reference };
  }

  return {
    async getPixels(options: GetPixelsOptions): Promise<GetPixelsResult> {
      const raw = await rpc.call<ImageDataTransport & { sourceBounds: GetPixelsResult["sourceBounds"]; level: number }>(
        PHOTOSHOP_IMAGING_MODULE_ID,
        "imaging.getPixels",
        [options]
      );
      return { imageData: decodeImageData(raw), sourceBounds: raw.sourceBounds, level: raw.level };
    },

    async getLayerMask(options: GetLayerMaskOptions): Promise<GetLayerMaskResult> {
      const raw = await rpc.call<ImageDataTransport & { sourceBounds: GetLayerMaskResult["sourceBounds"] }>(
        PHOTOSHOP_IMAGING_MODULE_ID,
        "imaging.getLayerMask",
        [options]
      );
      return { imageData: decodeImageData(raw), sourceBounds: raw.sourceBounds };
    },

    async getSelection(options: GetSelectionOptions): Promise<GetSelectionResult> {
      const raw = await rpc.call<ImageDataTransport & { sourceBounds: GetSelectionResult["sourceBounds"] }>(
        PHOTOSHOP_IMAGING_MODULE_ID,
        "imaging.getSelection",
        [options]
      );
      return { imageData: decodeImageData(raw), sourceBounds: raw.sourceBounds };
    },

    putPixels(options: PutPixelsOptions): Promise<void> {
      return rpc.call<void>(PHOTOSHOP_IMAGING_MODULE_ID, "imaging.putPixels", [
        withImageDataReference(options)
      ]);
    },

    putLayerMask(options: PutLayerMaskOptions): Promise<void> {
      return rpc.call<void>(PHOTOSHOP_IMAGING_MODULE_ID, "imaging.putLayerMask", [
        withImageDataReference(options)
      ]);
    },

    putSelection(options: PutSelectionOptions): Promise<void> {
      return rpc.call<void>(PHOTOSHOP_IMAGING_MODULE_ID, "imaging.putSelection", [
        withImageDataReference(options)
      ]);
    },

    createImageDataFromBuffer(
      buffer: Uint8Array | Uint16Array | Float32Array,
      options: CreateImageDataFromBufferOptions
    ): RemoteResult<PsImageData> {
      const promise = scheduler.run(async () => {
        const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const raw = await rpc.call<ImageDataTransport>(
          PHOTOSHOP_IMAGING_MODULE_ID,
          "imaging.createImageDataFromBuffer",
          [bytesToTransport(bytes), options]
        );
        return decodeImageData(raw);
      });
      return createRemoteResult(promise, scheduler, "photoshop.imaging.createImageDataFromBuffer");
    },

    encodeImageData(options: EncodeImageDataOptions): Promise<number[] | string> {
      return rpc.call<number[] | string>(PHOTOSHOP_IMAGING_MODULE_ID, "imaging.encodeImageData", [
        withImageDataReference(options)
      ]);
    }
  };
}

export const imaging: PhotoshopImaging = createImagingNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
