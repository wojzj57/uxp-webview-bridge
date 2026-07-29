/**
 * `WebviewPsLayer` — the WebView remote proxy for a Photoshop `Layer`.
 *
 * Same pattern as `WebviewPsDocument`: a class factory over the shared namespace context, static
 * descriptor tables as the runtime source of truth, `declare` members as the compile-time surface
 * (locked together by RFC-0007's static test). Scalar properties share the keyed
 * `layer.propertyGet`/`layer.propertySet` RPC via `remoteKey`; `bounds`/`boundsNoEffects` decode to
 * `ImagingBounds` value objects; `document`/`parent`/`linkedLayers` decode to related proxies. All
 * methods here are mutating and are wrapped in executeAsModal host-side (ADR 0007).
 */

import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { IMAGING_BOUNDS_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { BlendModeValue, ElementPlacementValue, FlipAxisValue, LayerKindValue } from "@shared/photoshop-api/photoshop-constants.js";
import type { PhotoshopContext } from "./context.js";
import type {
  ImagingBounds,
  Layers,
  PercentValue,
  PixelValue,
  PsLayer,
  PsLayerReadableKey,
  PsLayerWritableProps
} from "./types.js";

/** Read-only scalar Layer properties. */
const LAYER_READONLY_SCALARS = ["typename", "id", "locked", "isBackgroundLayer", "kind"] as const;

const LAYER_VOID_METHODS = [
  "delete", "unlink", "move", "translate", "flip", "scale", "rotate", "rasterize",
  "applyAddNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds",
  "applyCustomFilter", "applyDeInterlace", "applyDespeckle", "applyDifferenceClouds",
  "applyDiffuseGlow", "applyDisplace", "applyDustAndScratches", "applyGaussianBlur",
  "applyGlassEffect", "applyHighPass", "applyLensBlur", "applyLensFlare", "applyMaximum",
  "applyMinimum", "applyMedianNoise", "applyMotionBlur", "applyNTSC", "applyOceanRipple",
  "applyOffset", "applyTwirl", "applyPinch", "applyPolarCoordinates", "applyRipple",
  "applySharpen", "applySharpenEdges", "applySharpenMore", "applyShear", "applySmartBlur",
  "applySpherize", "applyUnSharpMask", "applyWave", "applyZigZag", "applyImage",
  "bringToFront", "sendToBack", "skew", "clear", "copy", "cut"
] as const;

/** Read/write scalar Layer properties. */
const LAYER_WRITABLE_SCALARS = [
  "name",
  "opacity",
  "fillOpacity",
  "visible",
  "blendMode",
  "allLocked",
  "pixelsLocked",
  "positionLocked",
  "transparentPixelsLocked",
  "isClippingMask",
  "filterMaskDensity",
  "filterMaskFeather",
  "layerMaskDensity",
  "layerMaskFeather",
  "vectorMaskDensity",
  "vectorMaskFeather",
  "selected"
] as const;

/**
 * Build the Layer property descriptor table. Exported (independently of the class factory) so the
 * registry static test can assert the declarative typings stay in sync with `PHOTOSHOP_RESULT_KINDS`
 * without constructing an instance. See {@link createDocumentProperties}.
 */
export function createLayerProperties(): Record<string, RemotePropertyDescriptor> {
  const { Document, Layer } = PHOTOSHOP_REMOTE_TYPE;
  const properties: Record<string, RemotePropertyDescriptor> = {};
  for (const name of LAYER_READONLY_SCALARS) {
    properties[name] = { writable: false, mutating: false, remoteKey: name };
  }
  for (const name of LAYER_WRITABLE_SCALARS) {
    properties[name] = { writable: true, mutating: true, remoteKey: name };
  }
  properties.bounds = { writable: false, mutating: false, remoteKey: "bounds", valueKind: IMAGING_BOUNDS_VALUE_KIND };
  properties.boundsNoEffects = { writable: false, mutating: false, remoteKey: "boundsNoEffects", valueKind: IMAGING_BOUNDS_VALUE_KIND };
  properties.document = { writable: false, mutating: false, remoteKey: "document", refType: Document };
  properties.parent = { writable: false, mutating: false, remoteKey: "parent", refType: Layer };
  properties.linkedLayers = { writable: false, mutating: false, remoteKey: "linkedLayers", collectionOf: Layer };
  properties.textItem = { writable: false, mutating: false, remoteKey: "textItem", refType: PHOTOSHOP_REMOTE_TYPE.TextItem };
  properties.layers = { writable: false, mutating: false, remoteKey: "layers", collectionOf: Layer };
  return properties;
}

/** Build the Layer method descriptor table (see {@link createLayerProperties}). */
export function createLayerMethods(): Record<string, RemoteMethodDescriptor> {
  const { Layer } = PHOTOSHOP_REMOTE_TYPE;
  return {
    ...Object.fromEntries(LAYER_VOID_METHODS.map((name) => [name, { mutating: true }])),
    duplicate: { mutating: true, refType: Layer },
    link: { mutating: true, collectionOf: Layer },
    merge: { mutating: true, refType: Layer }
  };
}

export function createLayerClass(context: PhotoshopContext): {
  new (reference: RemoteReference): PsLayer;
} {
  const { rpc, registry } = context;

  const properties = createLayerProperties();
  const methods = createLayerMethods();

  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "layer.propertyGet"])),
    propertySet: Object.fromEntries(LAYER_WRITABLE_SCALARS.map((name) => [name, "layer.propertySet"])),
    method: Object.fromEntries(Object.keys(methods).map((name) => [name, `layer.${name}`])),
    batchGet: "layer.batchGet",
    batchSet: "layer.batchSet",
    dispose: "layer.dispose"
  };

  const config: RemoteClassConfig = {
    rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods,
    argEncoders: context.argEncoders,
    decodeContext: registry.decodeContext
  };

  class WebviewPsLayer extends RemoteClass<PsLayer, PsLayerReadableKey, Partial<PsLayerWritableProps>> implements PsLayer {
    declare readonly typename: Promise<"Layer">;
    declare readonly id: Promise<number>;
    declare readonly locked: Promise<boolean>;
    declare readonly isBackgroundLayer: Promise<boolean>;
    declare readonly kind: Promise<LayerKindValue>;
    declare name: Promise<string>;
    declare opacity: Promise<number>;
    declare fillOpacity: Promise<number>;
    declare visible: Promise<boolean>;
    declare blendMode: Promise<BlendModeValue>;
    declare allLocked: Promise<boolean>;
    declare pixelsLocked: Promise<boolean>;
    declare positionLocked: Promise<boolean>;
    declare transparentPixelsLocked: Promise<boolean>;
    declare isClippingMask: Promise<boolean>;
    declare filterMaskDensity: Promise<number>;
    declare filterMaskFeather: Promise<number>;
    declare layerMaskDensity: Promise<number>;
    declare layerMaskFeather: Promise<number>;
    declare vectorMaskDensity: Promise<number>;
    declare vectorMaskFeather: Promise<number>;
    declare selected: Promise<boolean>;
    declare readonly bounds: Promise<ImagingBounds>;
    declare readonly boundsNoEffects: Promise<ImagingBounds>;
    declare readonly document: PsLayer["document"];
    declare readonly parent: PsLayer["parent"];
    declare readonly linkedLayers: Promise<Layers>;
    declare readonly textItem: PsLayer["textItem"];
    declare readonly layers: PsLayer["layers"];

    declare delete: () => Promise<void>;
    declare duplicate: PsLayer["duplicate"];
    declare link: (layer: PsLayer) => Promise<Layers>;
    declare unlink: () => Promise<void>;
    declare move: (relativeObject: PsLayer, placement: ElementPlacementValue) => Promise<void>;
    declare translate: (
      horizontal: number | PercentValue | PixelValue,
      vertical: number | PercentValue | PixelValue
    ) => Promise<void>;
    declare flip: (axis: FlipAxisValue) => Promise<void>;
    declare scale: PsLayer["scale"];
    declare rotate: PsLayer["rotate"];
    declare merge: PsLayer["merge"];
    declare rasterize: PsLayer["rasterize"];
    declare applyAddNoise: PsLayer["applyAddNoise"];
    declare applyAverage: PsLayer["applyAverage"];
    declare applyBlur: PsLayer["applyBlur"];
    declare applyBlurMore: PsLayer["applyBlurMore"];
    declare applyClouds: PsLayer["applyClouds"];
    declare applyCustomFilter: PsLayer["applyCustomFilter"];
    declare applyDeInterlace: PsLayer["applyDeInterlace"];
    declare applyDespeckle: PsLayer["applyDespeckle"];
    declare applyDifferenceClouds: PsLayer["applyDifferenceClouds"];
    declare applyDiffuseGlow: PsLayer["applyDiffuseGlow"];
    declare applyDisplace: PsLayer["applyDisplace"];
    declare applyDustAndScratches: PsLayer["applyDustAndScratches"];
    declare applyGaussianBlur: PsLayer["applyGaussianBlur"];
    declare applyGlassEffect: PsLayer["applyGlassEffect"];
    declare applyHighPass: PsLayer["applyHighPass"];
    declare applyLensBlur: PsLayer["applyLensBlur"];
    declare applyLensFlare: PsLayer["applyLensFlare"];
    declare applyMaximum: PsLayer["applyMaximum"];
    declare applyMinimum: PsLayer["applyMinimum"];
    declare applyMedianNoise: PsLayer["applyMedianNoise"];
    declare applyMotionBlur: PsLayer["applyMotionBlur"];
    declare applyNTSC: PsLayer["applyNTSC"];
    declare applyOceanRipple: PsLayer["applyOceanRipple"];
    declare applyOffset: PsLayer["applyOffset"];
    declare applyTwirl: PsLayer["applyTwirl"];
    declare applyPinch: PsLayer["applyPinch"];
    declare applyPolarCoordinates: PsLayer["applyPolarCoordinates"];
    declare applyRipple: PsLayer["applyRipple"];
    declare applySharpen: PsLayer["applySharpen"];
    declare applySharpenEdges: PsLayer["applySharpenEdges"];
    declare applySharpenMore: PsLayer["applySharpenMore"];
    declare applyShear: PsLayer["applyShear"];
    declare applySmartBlur: PsLayer["applySmartBlur"];
    declare applySpherize: PsLayer["applySpherize"];
    declare applyUnSharpMask: PsLayer["applyUnSharpMask"];
    declare applyWave: PsLayer["applyWave"];
    declare applyZigZag: PsLayer["applyZigZag"];
    declare applyImage: PsLayer["applyImage"];
    declare bringToFront: PsLayer["bringToFront"];
    declare sendToBack: PsLayer["sendToBack"];
    declare skew: PsLayer["skew"];
    declare clear: PsLayer["clear"];
    declare copy: PsLayer["copy"];
    declare cut: PsLayer["cut"];

    constructor(source: RemoteReference | RemoteConstructionRequest) {
      super(config, source);
    }
  }

  return WebviewPsLayer;
}
