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
  ChannelTypeValue,
  ElementPlacementValue,
  FlipAxisValue,
  LayerKindValue,
  SaveOptionsValue
} from "@shared/photoshop-api/photoshop-constants.js";
import type {
  AnchorPosition,
  BlendMode,
  ChannelType,
  ElementPlacement,
  FlipAxis,
  LayerKind,
  SaveOptions
} from "@shared/photoshop-api/photoshop-constants.js";
import type { PhotoshopCore } from "../core/types.js";
import type { PhotoshopImaging } from "../imaging/types.js";

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

/** RGB color-model view of a {@link PsSolidColor} (`hexValue` is the sole string field). */
export interface RgbColorView {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly hexValue: string;
}

/** HSB color-model view of a {@link PsSolidColor}. */
export interface HsbColorView {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
}

/** CMYK color-model view of a {@link PsSolidColor}. */
export interface CmykColorView {
  readonly cyan: number;
  readonly magenta: number;
  readonly yellow: number;
  readonly black: number;
}

/** LAB color-model view of a {@link PsSolidColor}. */
export interface LabColorView {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Grayscale color-model view of a {@link PsSolidColor}. */
export interface GrayColorView {
  readonly gray: number;
}

/**
 * A Photoshop `SolidColor` as a plain value object — every color-model view plus the base model's
 * `typename`, decoded synchronously from the transport envelope. No remote handle, no methods, no
 * `dispose` (mirrors {@link ImagingBounds}); reading a channel's `color` materializes it fully.
 * `nearestWebColor`/`isEqual` and WebView-side construction are out of scope in this batch.
 */
export interface PsSolidColor {
  readonly rgb: RgbColorView;
  readonly hsb: HsbColorView;
  readonly cmyk: CmykColorView;
  readonly lab: LabColorView;
  readonly gray: GrayColorView;
  readonly typename: string;
}

/**
 * Input accepted when writing a color (e.g. `channel.color = ...`). Either a previously-read
 * {@link PsSolidColor} or a single-model partial; the host applies the corresponding sub-model to a
 * fresh `SolidColor`, matching Adobe's model-switch-on-write behavior.
 */
export type SolidColorInput =
  | PsSolidColor
  | { readonly rgb: Partial<RgbColorView> }
  | { readonly hsb: Partial<HsbColorView> }
  | { readonly cmyk: Partial<CmykColorView> }
  | { readonly lab: Partial<LabColorView> }
  | { readonly gray: Partial<GrayColorView> };

/**
 * WebView-local collection of {@link PsChannel}. Same snapshot semantics as {@link Layers}: an
 * `Array`-like view over an id snapshot taken at read time, with lazily-resolved members. Because a
 * channel has no stable native id, member proxies are *not* `===`-deduped across snapshots (each
 * read yields fresh proxies).
 */
export interface Channels extends ReadonlyArray<PsChannel> {
  /** Resolve the channel with the given name via a single host RPC (`null` if none). */
  getByName(name: string): Promise<PsChannel | null>;
  /** Create a writable alpha channel in the owning document. */
  add(): Promise<PsChannel>;
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
  readonly channels: Promise<Channels>;
  readonly componentChannels: Promise<Channels>;
  readonly activeChannels: Promise<Channels>;

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

/**
 * Remote proxy for a Photoshop `Channel`. The first new DOM class built on the batch-0.5 registry
 * foundation (RFC-0011). `histogram` is a raw `number[]` (scalar); `color` decodes to a
 * {@link PsSolidColor} value object and accepts a {@link SolidColorInput} on write; `parent`
 * resolves to the owning {@link PsDocument}. All methods mutate and are host-wrapped in
 * executeAsModal (ADR 0007). A channel has no stable native id, so channel proxies are not
 * `===`-deduped (each read yields a fresh proxy).
 */
export interface PsChannel {
  // Read/write scalars
  name: Promise<string>;
  opacity: Promise<number>;
  visible: Promise<boolean>;
  kind: Promise<ChannelTypeValue>;
  // Read-only scalar (raw number[256], only valid on a visible channel)
  readonly histogram: Promise<readonly number[]>;
  // Value-object property (read/write)
  color: Promise<PsSolidColor>;
  // Reference property
  readonly parent: Promise<PsDocument>;

  // Mutating methods (host wraps in executeAsModal)
  duplicate(targetDocument?: PsDocument): Promise<void>;
  merge(): Promise<void>;
  remove(): Promise<void>;

  // Batch
  batchGet<K extends PsChannelReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsChannelWritableProps>): void;
  dispose(): Promise<void>;
}

/** Writable Channel properties (input shape for {@link PsChannel.batchSet}). */
export interface PsChannelWritableProps {
  name: string;
  opacity: number;
  visible: boolean;
  kind: ChannelTypeValue;
  color: SolidColorInput;
}

/** Every readable Channel property key (input to {@link PsChannel.batchGet}). */
export type PsChannelReadableKey =
  | "name"
  | "opacity"
  | "visible"
  | "kind"
  | "histogram"
  | "color";

/** Options accepted by {@link PhotoshopApp.open}. */
export interface OpenOptions {
  readonly path?: string;
}

/**
 * A Photoshop action descriptor: schema-less, arbitrarily-nested JSON with a required `_obj`. It is
 * transported verbatim across the bridge — never inspected, reference-decoded, or transformed on
 * either side (ADR 0010). Any `_ref`/`_id` inside use Photoshop's *native* id space, disjoint from
 * this bridge's handle registry; supplying those ids is the caller's responsibility. Structurally
 * mirrors Adobe's `ActionDescriptor`.
 */
export interface ActionDescriptor {
  _obj: string;
  [prop: string]: unknown;
}

/** A native Photoshop action reference. Its ids belong to Photoshop, not the bridge registry. */
export interface ActionReference {
  [prop: string]: number | string;
}

/**
 * Options for {@link PhotoshopActions.batchPlay}, forwarded verbatim to Adobe's `batchPlay`.
 * Structurally mirrors Adobe's `BatchPlayCommandOptions`; the host does not interpret these fields,
 * it passes them through so callers control modal/synchronous behavior.
 */
export interface BatchPlayCommandOptions {
  readonly commandEnablement?: "normal" | "never" | "always";
  readonly dialogOptions?: "silent" | "dontDisplay" | "display";
  readonly propagateErrorToDefaultHandler?: boolean;
  readonly synchronousExecution?: boolean;
  readonly modalBehavior?: "wait" | "execute" | "fail";
  readonly useMultiGet?: boolean;
  readonly suppressPlayLevelIncrease?: boolean;
  readonly continueOnError?: boolean;
  readonly immediateRedraw?: boolean;
}

/** Metadata recorded into the Photoshop Actions panel for a plugin-provided action step. */
export interface RecordActionOptions {
  /** User-visible step name shown in the Actions panel. */
  readonly name: string;
  /**
   * Name of a globally accessible playback handler in the UXP host runtime. A WebView function
   * cannot be used directly because Photoshop invokes this handler later when the action is played.
   */
  readonly methodName: string;
}

/**
 * The `photoshop.action` surface: low-level operations on Photoshop's native action system.
 * Descriptor and reference ids use Photoshop's own id space and are never decoded as bridge refs.
 */
export interface PhotoshopActions {
  /**
   * Run a batch of action descriptors on the host's real `action.batchPlay`. Commands and the
   * returned descriptors cross the bridge as verbatim JSON; the host wraps the call in
   * `executeAsModal` and forwards `options` unchanged. Rejections surface as `BridgeRemoteError`.
   */
  batchPlay(
    commands: readonly ActionDescriptor[],
    options?: BatchPlayCommandOptions
  ): Promise<ActionDescriptor[]>;

  /**
   * Run Photoshop's synchronous batchPlay implementation on the host. The WebView call remains
   * asynchronous because every bridge request resolves through RPC.
   */
  batchPlaySync(
    commands: readonly ActionDescriptor[],
    options?: BatchPlayCommandOptions
  ): Promise<ActionDescriptor[]>;

  /** Resolve or allocate Photoshop's numeric id for an action string. */
  getIDFromString(value: string): Promise<number>;

  /**
   * Record a plugin action step when the Photoshop Actions panel is actively recording. The named
   * playback handler must already exist globally in the UXP host; this call does not bridge a
   * WebView callback for later playback.
   */
  recordAction(options: RecordActionOptions, info: Record<string, unknown>): Promise<void>;

  /** Validate one native Photoshop action reference or a reference chain. */
  validateReference(ref: ActionReference | readonly ActionReference[]): Promise<boolean>;
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
  readonly action: PhotoshopActions;
  readonly core: PhotoshopCore;
  readonly imaging: PhotoshopImaging;
  readonly LayerKind: typeof LayerKind;
  readonly BlendMode: typeof BlendMode;
  readonly AnchorPosition: typeof AnchorPosition;
  readonly ElementPlacement: typeof ElementPlacement;
  readonly SaveOptions: typeof SaveOptions;
  readonly FlipAxis: typeof FlipAxis;
  readonly ChannelType: typeof ChannelType;
}
