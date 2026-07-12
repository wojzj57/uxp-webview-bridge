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
import type { AnchorPositionValue, BlendModeValue, ElementPlacementValue, FlipAxisValue, LayerKindValue } from "@shared/photoshop-api/photoshop-constants.js";
import type { PhotoshopContext } from "./context.js";
import type {
  AngleValue,
  ImagingBounds,
  Layers,
  PercentValue,
  PixelValue,
  PsDocument,
  PsLayer
} from "./types.js";

/** Read-only scalar Layer properties. */
const LAYER_READONLY_SCALARS = ["id", "locked", "isBackgroundLayer", "kind"] as const;

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
  return properties;
}

/** Build the Layer method descriptor table (see {@link createLayerProperties}). */
export function createLayerMethods(): Record<string, RemoteMethodDescriptor> {
  const { Layer } = PHOTOSHOP_REMOTE_TYPE;
  return {
    delete: { mutating: true },
    duplicate: { mutating: true, refType: Layer },
    link: { mutating: true, collectionOf: Layer },
    unlink: { mutating: true },
    move: { mutating: true },
    translate: { mutating: true },
    flip: { mutating: true },
    scale: { mutating: true },
    rotate: { mutating: true },
    merge: { mutating: true, refType: Layer },
    rasterize: { mutating: true }
  };
}

export function createLayerClass(context: PhotoshopContext): {
  new (reference: RemoteReference): PsLayer;
} {
  const { rpc, registry } = context;

  const properties = createLayerProperties();

  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "layer.propertyGet"])),
    propertySet: Object.fromEntries(LAYER_WRITABLE_SCALARS.map((name) => [name, "layer.propertySet"])),
    method: {
      delete: "layer.delete",
      duplicate: "layer.duplicate",
      link: "layer.link",
      unlink: "layer.unlink",
      move: "layer.move",
      translate: "layer.translate",
      flip: "layer.flip",
      scale: "layer.scale",
      rotate: "layer.rotate",
      merge: "layer.merge",
      rasterize: "layer.rasterize"
    },
    batchGet: "layer.batchGet",
    batchSet: "layer.batchSet",
    dispose: "layer.dispose"
  };

  const methods = createLayerMethods();

  const config: RemoteClassConfig = {
    rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods,
    argEncoders: [],
    decodeContext: registry.decodeContext
  };

  class WebviewPsLayer extends RemoteClass implements PsLayer {
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
    declare readonly document: Promise<PsDocument>;
    declare readonly parent: Promise<PsLayer | null>;
    declare readonly linkedLayers: Promise<Layers>;

    declare delete: () => Promise<void>;
    declare duplicate: (targetDocument?: PsDocument, name?: string) => Promise<PsLayer>;
    declare link: (layer: PsLayer) => Promise<Layers>;
    declare unlink: () => Promise<void>;
    declare move: (relativeObject: PsLayer, placement: ElementPlacementValue) => Promise<void>;
    declare translate: (
      horizontal: number | PercentValue | PixelValue,
      vertical: number | PercentValue | PixelValue
    ) => Promise<void>;
    declare flip: (axis: FlipAxisValue) => Promise<void>;
    declare scale: (
      width: number | PercentValue,
      height: number | PercentValue,
      anchor?: AnchorPositionValue
    ) => Promise<void>;
    declare rotate: (angle: number | AngleValue, anchor?: AnchorPositionValue) => Promise<void>;
    declare merge: () => Promise<PsLayer>;
    declare rasterize: (target?: string) => Promise<void>;

    constructor(source: RemoteReference | RemoteConstructionRequest) {
      super(config, source);
    }
  }

  return WebviewPsLayer as unknown as { new (reference: RemoteReference): PsLayer };
}
