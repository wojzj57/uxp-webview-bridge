/**
 * WebView-facing types for the `photoshop` remote namespace.
 *
 * These are the proxy shapes seen by WebView callers, not Adobe's native DOM types. Every scalar
 * getter is a `Promise<T>` and every setter is fire-and-forget (ADR 0003); methods return promises.
 * Following the xmp precedent, this module defines its own remote shapes rather than depending on
 * the ambient Adobe `photoshop` types (whose `.d.ts` carries no runtime values and whose
 * `@shared-types/photoshop/*` path alias points at a non-existent directory). The transcribed
 * constant *value* types come from RFC-0004's `photoshop-constants.ts`.
 */

import type {
  AnchorPositionValue,
  BlendModeValue,
  ElementPlacementValue,
  FlipAxisValue,
  LayerKindValue,
  SaveOptionsValue
} from "@shared/photoshop-api/photoshop-constants.js";
import type {
  AnchorPosition,
  BlendMode,
  ElementPlacement,
  FlipAxis,
  LayerKind,
  SaveOptions
} from "@shared/photoshop-api/photoshop-constants.js";

/**
 * A rectangle in document pixel coordinates. Plain value object — no remote handle, no methods.
 * Mirrors the shared `ImagingBoundsTransport` six-field shape.
 */
export interface ImagingBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * WebView-local collection of {@link PsLayer}. It is an `Array`-like view over an id snapshot taken
 * at read time; `[index]`/iteration/`length` lazily resolve ids to `===`-stable `PsLayer` instances.
 * The snapshot is not auto-refreshed — accessing an id whose layer is gone rejects with a
 * `BridgeRemoteError`; re-await the owning property to get a fresh snapshot.
 */
export interface Layers extends ReadonlyArray<PsLayer> {
  /** Resolve the layer with the given name via a single host RPC (`null` if none). */
  getByName(name: string): Promise<PsLayer | null>;
  /** Create/add a layer on the owning document or group (mutating host call). */
  add(options?: LayerCreateOptions): Promise<PsLayer>;
}

/** Options accepted when creating a layer (subset closed to this batch). */
export interface LayerCreateOptions {
  readonly name?: string;
  readonly opacity?: number;
  readonly blendMode?: BlendModeValue;
}

/** Options for {@link PsDocument.close}. */
export interface DocumentCloseOptions {
  readonly saveDialogOptions?: SaveOptionsValue;
}

/** Options for {@link PsDocument.resizeCanvas} / {@link PsDocument.resizeImage}. */
export interface ResizeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly anchor?: AnchorPositionValue;
  readonly resolution?: number;
}

/**
 * Remote proxy for a Photoshop `Document`. Getters resolve asynchronously over the bridge; the one
 * writable scalar (`pixelAspectRatio`) is set fire-and-forget with read-your-writes ordering.
 */
export interface PsDocument {
  // Read-only scalars
  readonly id: Promise<number>;
  readonly saved: Promise<boolean>;
  readonly name: Promise<string>;
  readonly title: Promise<string>;
  readonly path: Promise<string>;
  readonly width: Promise<number>;
  readonly height: Promise<number>;
  readonly resolution: Promise<number>;
  readonly cloudDocument: Promise<boolean>;
  readonly cloudWorkAreaDirectory: Promise<string>;
  // Read/write scalar
  pixelAspectRatio: Promise<number>;
  // Collection & reference properties
  readonly layers: Promise<Layers>;
  readonly activeLayers: Promise<Layers>;
  readonly artboards: Promise<Layers>;
  readonly backgroundLayer: Promise<PsLayer | null>;

  // Non-mutating method
  duplicate(name?: string, mergeLayersOnly?: boolean): Promise<PsDocument>;

  // Mutating methods (host wraps in executeAsModal)
  close(options?: DocumentCloseOptions): Promise<void>;
  closeWithoutSaving(): Promise<void>;
  flatten(): Promise<void>;
  mergeVisibleLayers(): Promise<PsLayer>;
  revealAll(): Promise<void>;
  rasterizeAllLayers(): Promise<void>;
  crop(bounds: ImagingBounds, angle?: number, width?: number, height?: number): Promise<void>;
  resizeCanvas(options?: ResizeOptions): Promise<void>;
  resizeImage(options?: ResizeOptions): Promise<void>;
  trim(trimType?: string, top?: boolean, left?: boolean, bottom?: boolean, right?: boolean): Promise<void>;
  rotate(angle: number): Promise<void>;
  save(): Promise<void>;
  createLayer(options?: LayerCreateOptions): Promise<PsLayer>;
  createPixelLayer(options?: LayerCreateOptions): Promise<PsLayer>;
  createTextLayer(options?: LayerCreateOptions): Promise<PsLayer>;
  createLayerGroup(options?: LayerCreateOptions): Promise<PsLayer>;
  groupLayers(layers: readonly PsLayer[]): Promise<PsLayer>;
  duplicateLayers(layers: readonly PsLayer[], targetDocument?: PsDocument): Promise<Layers>;
  linkLayers(layers: readonly PsLayer[]): Promise<Layers>;
  paste(intoSelection?: boolean): Promise<PsLayer>;

  // Batch
  batchGet<K extends PsDocumentReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsDocumentWritableProps>): void;
  dispose(): Promise<void>;
}

/** Writable Document properties (input shape for {@link PsDocument.batchSet}). */
export interface PsDocumentWritableProps {
  pixelAspectRatio: number;
}

/** Every readable Document property key (input to {@link PsDocument.batchGet}). */
export type PsDocumentReadableKey =
  | "id"
  | "saved"
  | "name"
  | "title"
  | "path"
  | "width"
  | "height"
  | "resolution"
  | "cloudDocument"
  | "cloudWorkAreaDirectory"
  | "pixelAspectRatio";

/**
 * Remote proxy for a Photoshop `Layer`. Read-only scalars plus many writable scalars; `bounds`
 * decode to {@link ImagingBounds} value objects; reference properties resolve to related proxies.
 */
export interface PsLayer {
  // Read-only scalars
  readonly id: Promise<number>;
  readonly locked: Promise<boolean>;
  readonly isBackgroundLayer: Promise<boolean>;
  readonly kind: Promise<LayerKindValue>;
  // Read/write scalars
  name: Promise<string>;
  opacity: Promise<number>;
  fillOpacity: Promise<number>;
  visible: Promise<boolean>;
  blendMode: Promise<BlendModeValue>;
  allLocked: Promise<boolean>;
  pixelsLocked: Promise<boolean>;
  positionLocked: Promise<boolean>;
  transparentPixelsLocked: Promise<boolean>;
  isClippingMask: Promise<boolean>;
  filterMaskDensity: Promise<number>;
  filterMaskFeather: Promise<number>;
  layerMaskDensity: Promise<number>;
  layerMaskFeather: Promise<number>;
  vectorMaskDensity: Promise<number>;
  vectorMaskFeather: Promise<number>;
  selected: Promise<boolean>;
  // Value-object properties
  readonly bounds: Promise<ImagingBounds>;
  readonly boundsNoEffects: Promise<ImagingBounds>;
  // Reference properties
  readonly document: Promise<PsDocument>;
  readonly parent: Promise<PsLayer | null>;
  readonly linkedLayers: Promise<Layers>;

  // Mutating methods (host wraps in executeAsModal)
  delete(): Promise<void>;
  duplicate(targetDocument?: PsDocument, name?: string): Promise<PsLayer>;
  link(layer: PsLayer): Promise<Layers>;
  unlink(): Promise<void>;
  move(relativeObject: PsLayer, placement: ElementPlacementValue): Promise<void>;
  translate(horizontal?: number, vertical?: number): Promise<void>;
  flip(axis: FlipAxisValue): Promise<void>;
  scale(width: number, height: number, anchor?: AnchorPositionValue): Promise<void>;
  rotate(angle: number, anchor?: AnchorPositionValue): Promise<void>;
  merge(): Promise<PsLayer>;
  rasterize(target?: string): Promise<void>;

  // Batch
  batchGet<K extends PsLayerReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsLayerWritableProps>): void;
  dispose(): Promise<void>;
}

/** Writable Layer properties (input shape for {@link PsLayer.batchSet}). */
export interface PsLayerWritableProps {
  name: string;
  opacity: number;
  fillOpacity: number;
  visible: boolean;
  blendMode: BlendModeValue;
  allLocked: boolean;
  pixelsLocked: boolean;
  positionLocked: boolean;
  transparentPixelsLocked: boolean;
  isClippingMask: boolean;
  filterMaskDensity: number;
  filterMaskFeather: number;
  layerMaskDensity: number;
  layerMaskFeather: number;
  vectorMaskDensity: number;
  vectorMaskFeather: number;
  selected: boolean;
}

/** Every readable Layer property key (input to {@link PsLayer.batchGet}). */
export type PsLayerReadableKey =
  | "id"
  | "locked"
  | "isBackgroundLayer"
  | "kind"
  | "name"
  | "opacity"
  | "fillOpacity"
  | "visible"
  | "blendMode"
  | "allLocked"
  | "pixelsLocked"
  | "positionLocked"
  | "transparentPixelsLocked"
  | "isClippingMask"
  | "filterMaskDensity"
  | "filterMaskFeather"
  | "layerMaskDensity"
  | "layerMaskFeather"
  | "vectorMaskDensity"
  | "vectorMaskFeather"
  | "selected"
  | "bounds"
  | "boundsNoEffects";

/** Options accepted by {@link PhotoshopApp.open}. */
export interface OpenOptions {
  readonly path?: string;
}

/** The `photoshop.app` entry surface. */
export interface PhotoshopApp {
  readonly activeDocument: Promise<PsDocument>;
  readonly documents: Promise<readonly PsDocument[]>;
  open(options?: OpenOptions): Promise<PsDocument>;
}

/** The `photoshop` namespace: app entry plus the transcribed enum tables. */
export interface PhotoshopNamespace {
  readonly app: PhotoshopApp;
  readonly LayerKind: typeof LayerKind;
  readonly BlendMode: typeof BlendMode;
  readonly AnchorPosition: typeof AnchorPosition;
  readonly ElementPlacement: typeof ElementPlacement;
  readonly SaveOptions: typeof SaveOptions;
  readonly FlipAxis: typeof FlipAxis;
}
