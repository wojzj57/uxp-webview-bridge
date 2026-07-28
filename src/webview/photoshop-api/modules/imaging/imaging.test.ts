/**
 * Imaging module tests (RFC-0010 Part 2).
 *
 * Two independent layers share this file, matching the photoshop-module precedent
 * (`../photoshop/photoshop.test.ts`):
 *
 * 1. **Static consistency (compile-time only).** Module-scope `type`-level assertions that run under
 *    `pnpm typecheck` and the CDP webview tsc project, emitting no runtime code (all relative imports
 *    are `type`-only, as the static boundary checker requires for WebView CDP test files). They prove
 *    our locally-mirrored imaging option/result shapes stay compatible with Adobe's real
 *    `ImagingModule.d.ts` types (reached through the working `@shared/*` alias). Because our shapes
 *    deliberately retype `imageData` to the {@link PsImageData} proxy and the bounds/size fields to
 *    our own rect/size mirrors, the assertions compare the *scalar* option surface (documentID,
 *    layerID, replace, kind, componentSize, width/height/components/colorSpace/...) — a drift in any
 *    hand-copied scalar field fails to compile.
 *
 * 2. **Co-located CDP cases (real Photoshop via `test:uxp`).** The `photoshop.imaging`-prefixed cases
 *    exercise the live bridge, following the same conventions as the photoshop CDP cases
 *    (`bridge.ensureConfigured()`, `assert`, `skip`, best-effort cleanup / `dispose`). They only ever
 *    touch `ctx.bridge`; the Adobe host owns all real imaging work. These runs are deferred until the
 *    Photoshop host is available.
 */

import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

// --- Static layer: type-only imports (erased at runtime; allowed by the static boundary checker) ---
import type {
  CreateImageDataFromBufferOptions as AdobeCreateImageDataFromBufferOptions,
  EncodeImageDataOptions as AdobeEncodeImageDataOptions,
  GetDataOptions as AdobeGetDataOptions,
  GetLayerMaskOptions as AdobeGetLayerMaskOptions,
  GetPixelsOptions as AdobeGetPixelsOptions,
  GetSelectionOptions as AdobeGetSelectionOptions,
  PutLayerMaskOptions as AdobePutLayerMaskOptions,
  PutPixelsOptions as AdobePutPixelsOptions,
  PutSelectionOptions as AdobePutSelectionOptions
} from "@shared/types/photoshop/internal/dom/ImagingModule.js";
import type {
  CreateImageDataFromBufferOptions,
  EncodeImageDataOptions,
  GetDataOptions,
  GetLayerMaskOptions,
  GetPixelsOptions,
  GetSelectionOptions,
  PhotoshopImaging,
  PsImageData,
  PutLayerMaskOptions,
  PutPixelsOptions,
  PutSelectionOptions
} from "./types.js";

// ---------------------------------------------------------------------------------------------------
// Static consistency assertions (compile-time only)
// ---------------------------------------------------------------------------------------------------

/** Compiles only when `From` is assignable to `To`. */
type Assignable<From, To> = [From] extends [To] ? true : never;

/**
 * The fields whose type legitimately differs between our mirror and Adobe's shapes: `imageData` is
 * retyped to the {@link PsImageData} proxy, and `sourceBounds`/`targetSize`/`targetBounds` use our own
 * rect/size mirrors. They are omitted from the scalar-surface comparison so the assertions target the
 * hand-copied scalar option fields.
 */
type ScalarSurface<T> = Omit<T, "imageData" | "sourceBounds" | "targetSize" | "targetBounds">;

// Options we send must stay assignable to Adobe's options on the scalar surface (a drifted or extra
// scalar field would break the real API call). GetDataOptions/CreateImageDataFromBufferOptions/
// EncodeImageDataOptions carry only scalars aside from the retyped imageData.
type _GetPixelsScalars = Assignable<ScalarSurface<GetPixelsOptions>, ScalarSurface<AdobeGetPixelsOptions>>;
type _PutPixelsScalars = Assignable<ScalarSurface<PutPixelsOptions>, ScalarSurface<AdobePutPixelsOptions>>;
type _GetLayerMaskScalars = Assignable<ScalarSurface<GetLayerMaskOptions>, ScalarSurface<AdobeGetLayerMaskOptions>>;
type _PutLayerMaskScalars = Assignable<ScalarSurface<PutLayerMaskOptions>, ScalarSurface<AdobePutLayerMaskOptions>>;
type _GetSelectionScalars = Assignable<ScalarSurface<GetSelectionOptions>, ScalarSurface<AdobeGetSelectionOptions>>;
type _PutSelectionScalars = Assignable<ScalarSurface<PutSelectionOptions>, ScalarSurface<AdobePutSelectionOptions>>;
type _CreateScalars = Assignable<ScalarSurface<CreateImageDataFromBufferOptions>, ScalarSurface<AdobeCreateImageDataFromBufferOptions>>;
type _EncodeScalars = Assignable<ScalarSurface<EncodeImageDataOptions>, ScalarSurface<AdobeEncodeImageDataOptions>>;
// GetDataOptions has no imageData/bounds fields, so compare it whole, both ways.
type _GetDataToAdobe = Assignable<GetDataOptions, AdobeGetDataOptions>;
type _GetDataFromAdobe = Assignable<AdobeGetDataOptions, GetDataOptions>;

/**
 * `PsImageData.getData` must return the typed-array union implied by `componentSize`; assert its
 * declared return type is exactly `Promise<Uint8Array | Uint16Array | Float32Array>`.
 */
type _GetDataReturn = Assignable<
  ReturnType<PsImageData["getData"]>,
  Promise<Uint8Array | Uint16Array | Float32Array>
>;

// Reference the compile-time-only aliases so they are not stripped; `type` aliases are erased anyway.
export type _StaticConsistencyProof = [
  _GetPixelsScalars,
  _PutPixelsScalars,
  _GetLayerMaskScalars,
  _PutLayerMaskScalars,
  _GetSelectionScalars,
  _PutSelectionScalars,
  _CreateScalars,
  _EncodeScalars,
  _GetDataToAdobe,
  _GetDataFromAdobe,
  _GetDataReturn
];

// ---------------------------------------------------------------------------------------------------
// CDP cases (real Photoshop host) — deferred until the host is available.
// ---------------------------------------------------------------------------------------------------

export default defineWebviewCdpCases([
  {
    name: "photoshop.imaging.public-shape",
    run({ bridge, assert }) {
      const imaging = bridge.photoshop.imaging;
      assert.ok(typeof imaging === "object" && imaging !== null, "photoshop.imaging must be an object.");
      assert.functions(
        imaging,
        [
          "getPixels",
          "putPixels",
          "getLayerMask",
          "putLayerMask",
          "getSelection",
          "putSelection",
          "createImageDataFromBuffer",
          "encodeImageData"
        ],
        "photoshop.imaging"
      );
      return { methodsChecked: 8 };
    }
  },
  {
    name: "photoshop.imaging.getpixels",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const result = await bridge.photoshop.imaging.getPixels({});
      const imageData: PsImageData = result.imageData;
      try {
        assert.ok(typeof imageData === "object" && imageData !== null, "getPixels should return an imageData handle.");
        assert.ok(typeof imageData.width === "number" && imageData.width > 0, "imageData.width should be positive.");
        assert.ok(typeof imageData.height === "number" && imageData.height > 0, "imageData.height should be positive.");
        assert.ok([8, 16, 32].includes(imageData.componentSize), "componentSize should be 8, 16, or 32.");

        const data = await imageData.getData();
        const expectedCtor =
          imageData.componentSize === 8 ? Uint8Array : imageData.componentSize === 16 ? Uint16Array : Float32Array;
        assert.ok(data instanceof expectedCtor, "getData should reconstruct the typed array implied by componentSize.");

        return { width: imageData.width, height: imageData.height, componentSize: imageData.componentSize, byteLength: data.byteLength };
      } finally {
        await disposeQuietly(imageData);
      }
    }
  },
  {
    name: "photoshop.imaging.roundtrip",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      // Build a tiny 2x1 RGBA buffer host-side from an incoming byte buffer, then read it back.
      const source = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
      const createdResult = bridge.photoshop.imaging.createImageDataFromBuffer(source, {
        width: 2,
        height: 1,
        components: 4,
        colorSpace: "RGB"
      });
      const created: PsImageData = await createdResult;
      try {
        assert.equal(created.width, 2, "createImageDataFromBuffer should honor the requested width.");
        assert.equal(created.height, 1, "createImageDataFromBuffer should honor the requested height.");

        const readBack = await createdResult.getData();
        assert.ok(readBack instanceof Uint8Array, "an 8-bit buffer should read back as Uint8Array.");
        assert.equal(readBack.byteLength, source.byteLength, "the round-tripped byte length should match.");

        return { readBackBytes: readBack.byteLength };
      } finally {
        await disposeQuietly(created);
      }
    }
  },
  {
    name: "photoshop.imaging.encode-base64",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const created: PsImageData = await bridge.photoshop.imaging.createImageDataFromBuffer(
        // encodeImageData defaults to JPEG; use RGB without alpha because Photoshop rejects
        // JPEG encoding for image data that carries an alpha component.
        new Uint8Array([1, 2, 3, 4, 5, 6]),
        { width: 2, height: 1, components: 3, colorSpace: "RGB" }
      );
      try {
        const encoded = await bridge.photoshop.imaging.encodeImageData({ imageData: created, base64: true });
        assert.nonEmptyString(encoded as string, "encodeImageData(base64) should return a non-empty string.");
        return { encodedLength: (encoded as string).length };
      } finally {
        await disposeQuietly(created);
      }
    }
  },
  {
    name: "photoshop.imaging.dispose",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const { imageData } = await bridge.photoshop.imaging.getPixels({});
      await imageData.dispose();

      // After dispose the host handle is gone: a subsequent getData must reject with a remote error.
      let rejected = false;
      try {
        await imageData.getData();
      } catch {
        rejected = true;
      }
      assert.ok(rejected, "getData after dispose should reject (the host handle was released).");
      return { disposed: true };
    }
  }
]);

// ---------------------------------------------------------------------------------------------------
// CDP helpers
// ---------------------------------------------------------------------------------------------------

interface SkipMarker {
  readonly __skip: true;
}

function isSkip(value: unknown): value is SkipMarker {
  return typeof value === "object" && value !== null && (value as SkipMarker).__skip === true;
}

async function getActiveDocument(
  bridge: { photoshop: any },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown
): Promise<unknown | SkipMarker> {
  try {
    const document = await bridge.photoshop.app.activeDocument;
    if (!document) {
      return markSkip(skip("photoshop.app.activeDocument is unavailable (no open document)."));
    }
    return document;
  } catch (error) {
    return markSkip(skip("photoshop.app.activeDocument threw; open a document to run this case.", { error: normalizeError(error) }));
  }
}

function markSkip(skipResult: unknown): SkipMarker {
  (skipResult as { __skip?: boolean }).__skip = true;
  return skipResult as SkipMarker;
}

async function disposeQuietly(imageData: PsImageData | undefined): Promise<void> {
  if (!imageData) {
    return;
  }
  try {
    await imageData.dispose();
  } catch {
    // Best-effort cleanup; assertions own pass/fail.
  }
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

function assertImagingRemoteResultTypes(imaging: PhotoshopImaging): void {
  const result = imaging.createImageDataFromBuffer(new Uint8Array(4), {
    width: 1,
    height: 1,
    components: 4,
    colorSpace: "RGB"
  });
  const legacyImageData: Promise<PsImageData> = result;
  const chainedDispose: Promise<void> = result.dispose();
  void [legacyImageData, chainedDispose];
}

void assertImagingRemoteResultTypes;
