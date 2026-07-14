/**
 * WebView-facing types for the `photoshop` remote namespace.
 *
 * These are the proxy shapes seen by WebView callers, not Adobe's native DOM types. Every scalar
 * getter is a `Promise<T>` and every setter is fire-and-forget (ADR 0003); methods return promises.
 * Following the xmp precedent, this module defines its own remote shapes rather than depending on
 * the ambient Adobe `photoshop` types (whose `.d.ts` carries no runtime values). The transcribed
 * constant *value* types come from RFC-0004's `photoshop-constants.ts`.
 */

import type {
  AnchorPositionValue,
  BlendModeValue,
  ChannelTypeValue,
  ColorModelValue,
  ColorBlendModeValue,
  DirectionValue,
  DialogModesValue,
  DocumentFillValue,
  EditLogItemsTypeValue,
  ElementPlacementValue,
  FlipAxisValue,
  InterpolationMethodValue,
  FontSizeValue,
  GridLineStyleValue,
  GridSizeValue,
  GuideLineStyleValue,
  LayerKindValue,
  MaximizeCompatibilityValue,
  NewDocumentModeValue,
  OtherCursorsValue,
  PaintingCursorsValue,
  PathKindValue,
  PointKindValue,
  PointTypeValue,
  RulerUnitsValue,
  SaveLogItemsTypeValue,
  SaveOptionsValue,
  SavePreviewValue,
  SelectionTypeValue,
  ShapeOperationValue,
  ToolTypeValue,
  TypeInterfaceFeaturesValue,
  TypeUnitsValue,
  UnitsValue
} from "@shared/photoshop-api/photoshop-constants.js";
import type { PhotoshopConstantsNamespace } from "@shared/photoshop-api/photoshop-constants.js";
import type {
  AngleValue,
  PercentValue,
  PixelValue
} from "@shared/types/photoshop/internal/util/unit.js";
export type {
  AngleValue,
  CentimeterValue,
  DensityValue,
  DistanceValue,
  InchValue,
  MillimeterValue,
  PercentValue,
  PicaValue,
  PixelValue,
  PointValue,
  UnitTypeEnum,
  UnitValue
} from "@shared/types/photoshop/internal/util/unit.js";
import { ColorConversionModel, type PhotoshopCore } from "../core/types.js";
import type { PhotoshopImaging } from "../imaging/types.js";
import type { UxpStorageFile } from "@webview/uxp-api/modules/uxp/persistent-file-storage/types.js";

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
  red: number;
  green: number;
  blue: number;
  hexValue: string;
}

/** HSB color-model view of a {@link PsSolidColor}. */
export interface HsbColorView {
  hue: number;
  saturation: number;
  brightness: number;
}

/** CMYK color-model view of a {@link PsSolidColor}. */
export interface CmykColorView {
  cyan: number;
  magenta: number;
  yellow: number;
  black: number;
}

/** LAB color-model view of a {@link PsSolidColor}. */
export interface LabColorView {
  l: number;
  a: number;
  b: number;
}

/** Grayscale color-model view of a {@link PsSolidColor}. */
export interface GrayColorView {
  gray: number;
}

/**
 * A WebView-local Photoshop `SolidColor` value object. It is synchronously constructible, switches
 * its active model when a model view is accessed, and crosses the bridge as a value envelope.
 */
export interface PsSolidColor {
  readonly rgb: RgbColorView;
  readonly hsb: HsbColorView;
  readonly cmyk: CmykColorView;
  readonly lab: LabColorView;
  readonly gray: GrayColorView;
  readonly typename: string;
  readonly nearestWebColor: RgbColorView;
  isEqual(color: SolidColorInput): boolean;
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

/** Constructor input accepted by the WebView-local SolidColor implementation. */
export type SolidColorConstructorInput = ColorModelValue | SolidColorInput;

/** Options accepted by Photoshop.createDocument and Documents.add. */
export interface DocumentCreateOptions {
  readonly name?: string;
  readonly preset?: string;
  readonly presetJSON?: string;
  readonly mode?: NewDocumentModeValue;
  readonly width?: number;
  readonly height?: number;
  readonly resolution?: number;
  readonly fill?: DocumentFillValue;
  readonly fillColor?: SolidColorInput;
  readonly depth?: number;
  readonly pixelScaleFactor?: number;
  readonly profile?: string;
}

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

/** Four-edge bounds accepted by Selection shape methods. */
export interface SelectionBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** One point in a polygonal Selection. */
export interface SelectionPoint {
  readonly x: number;
  readonly y: number;
}

/** Remote proxy for the active pixel selection owned by a Document. */
export interface PsSelection {
  readonly typename: Promise<"Selection">;
  readonly docId: Promise<number>;
  readonly parent: Promise<PsDocument>;
  readonly bounds: Promise<ImagingBounds | null>;
  readonly solid: Promise<boolean>;

  contract(by: number, applyEffectAtCanvasBounds?: boolean): Promise<void>;
  deselect(): Promise<void>;
  expand(by: number, applyEffectAtCanvasBounds?: boolean): Promise<void>;
  feather(by: number, applyEffectAtCanvasBounds?: boolean): Promise<void>;
  grow(tolerance: number, antiAlias?: boolean): Promise<void>;
  inverse(): Promise<void>;
  load(from: PsChannel | PsLayer, mode?: SelectionTypeValue, invert?: boolean): Promise<void>;
  makeWorkPath(tolerance?: number): Promise<PsPathItem>;
  selectAll(): Promise<void>;
  selectRectangle(
    bounds: SelectionBounds,
    mode?: SelectionTypeValue,
    feather?: number,
    antiAlias?: boolean
  ): Promise<void>;
  selectEllipse(
    bounds: SelectionBounds,
    mode?: SelectionTypeValue,
    feather?: number,
    antiAlias?: boolean
  ): Promise<void>;
  selectPolygon(
    points: readonly SelectionPoint[],
    mode?: SelectionTypeValue,
    feather?: number,
    antiAlias?: boolean
  ): Promise<void>;
  selectRow(y: number, mode?: SelectionTypeValue): Promise<void>;
  selectColumn(x: number, mode?: SelectionTypeValue): Promise<void>;
  save(channelName?: string): Promise<void>;
  saveTo(channel: PsChannel, mode?: SelectionTypeValue): Promise<void>;
  selectBorder(width: number): Promise<void>;
  smooth(radius: number, applyEffectAtCanvasBounds?: boolean): Promise<void>;
  translateBoundary(deltaX: number, deltaY: number): Promise<void>;
  resizeBoundary(
    horizontal?: number,
    vertical?: number,
    anchor?: AnchorPositionValue,
    interpolation?: InterpolationMethodValue
  ): Promise<void>;
  rotateBoundary(
    angle: number,
    anchor?: AnchorPositionValue,
    interpolation?: InterpolationMethodValue
  ): Promise<void>;

  batchGet<K extends PsSelectionReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsSelectionWritableProps>): void;
  dispose(): Promise<void>;
}

export type PsSelectionReadableKey = "typename" | "docId" | "parent" | "bounds" | "solid";
export type PsSelectionWritableProps = Record<string, never>;

/** Stable remote reference to one Photoshop history state. */
export interface PsHistoryState {
  readonly typename: Promise<"HistoryState">;
  readonly id: Promise<number>;
  readonly docId: Promise<number>;
  readonly name: Promise<string>;
  readonly parent: Promise<PsDocument>;
  readonly snapshot: Promise<boolean>;
  batchGet<K extends PsHistoryStateReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsHistoryStateWritableProps>): void;
  dispose(): Promise<void>;
}

export type PsHistoryStateReadableKey = "typename" | "id" | "docId" | "name" | "parent" | "snapshot";
export type PsHistoryStateWritableProps = Record<string, never>;

/** WebView-local snapshot of a Document's history states. */
export interface HistoryStates extends ReadonlyArray<PsHistoryState> {
  readonly parent: PsDocument;
  getByName(name: string): Promise<PsHistoryState | null>;
}

export interface Guides extends ReadonlyArray<PsGuide> {
  readonly parent: PsDocument;
  add(direction: DirectionValue, coordinate: number): Promise<PsGuide>;
  removeAll(): Promise<void>;
}

export interface PsGuide {
  readonly typename: Promise<"Guide">;
  readonly id: Promise<number>;
  readonly docId: Promise<number>;
  readonly parent: Promise<PsDocument>;
  direction: Promise<DirectionValue>;
  coordinate: Promise<number>;
  delete(): Promise<void>;
  batchGet<K extends PsGuideReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsGuideWritableProps>): void;
  dispose(): Promise<void>;
}
export type PsGuideReadableKey = "typename" | "id" | "docId" | "parent" | "direction" | "coordinate";
export interface PsGuideWritableProps { direction: DirectionValue; coordinate: number; }

export interface PathPointInfoInput {
  readonly anchor: readonly number[];
  readonly kind: PointKindValue;
  readonly leftDirection: readonly number[];
  readonly rightDirection: readonly number[];
}
export interface SubPathInfoInput {
  readonly closed: boolean;
  readonly entireSubPath: readonly PathPointInfoInput[];
  readonly operation: ShapeOperationValue;
}
export interface PathItems extends ReadonlyArray<PsPathItem> {
  readonly parent: PsDocument;
  add(name: string, entirePath: readonly SubPathInfoInput[]): Promise<PsPathItem>;
  removeAll(): Promise<void>;
  getByName(name: string): Promise<PsPathItem | null>;
}
export interface SubPathItems extends ReadonlyArray<PsSubPathItem> { readonly parent: PsPathItem; }
export interface PathPoints extends ReadonlyArray<PsPathPoint> { readonly parent: PsSubPathItem; }

export interface PsPathItem {
  readonly typename: Promise<"PathItem">;
  readonly id: Promise<number>;
  readonly docId: Promise<number>;
  readonly parent: Promise<PsDocument>;
  kind: Promise<PathKindValue>;
  name: Promise<string>;
  readonly subPathItems: Promise<SubPathItems>;
  deselect(): Promise<void>;
  duplicate(name?: string): Promise<PsPathItem>;
  fillPath(fillColor?: SolidColorInput, mode?: ColorBlendModeValue, opacity?: number, preserveTransparency?: boolean, feather?: number, wholePath?: boolean, antiAlias?: boolean): Promise<void>;
  makeClippingPath(flatness?: number): Promise<void>;
  makeSelection(feather?: number, antiAlias?: boolean, operation?: SelectionTypeValue): Promise<void>;
  remove(): Promise<void>;
  select(): Promise<void>;
  strokePath(tool?: ToolTypeValue, simulatePressure?: boolean, sourceOrigin?: SelectionPoint, sourceLayer?: PsLayer): Promise<void>;
  batchGet<K extends PsPathItemReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Partial<PsPathItemWritableProps>): void;
  dispose(): Promise<void>;
}
export type PsPathItemReadableKey = "typename" | "id" | "docId" | "parent" | "kind" | "name" | "subPathItems";
export interface PsPathItemWritableProps { kind: PathKindValue; name: string; }

export interface PsSubPathItem {
  readonly typename: Promise<"SubPathItem">;
  readonly parent: Promise<PsPathItem>;
  readonly operation: Promise<ShapeOperationValue>;
  readonly closed: Promise<boolean>;
  readonly pathPoints: Promise<PathPoints>;
  batchGet<K extends PsSubPathItemReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Record<string, never>): void;
  dispose(): Promise<void>;
}
export type PsSubPathItemReadableKey = "typename" | "parent" | "operation" | "closed" | "pathPoints";

export interface PsPathPoint {
  readonly typename: Promise<"PathPoint">;
  readonly parent: Promise<PsSubPathItem>;
  readonly anchor: Promise<number[]>;
  readonly kind: Promise<PointKindValue>;
  readonly leftDirection: Promise<number[]>;
  readonly rightDirection: Promise<number[]>;
  batchGet<K extends PsPathPointReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
  batchSet(properties: Record<string, never>): void;
  dispose(): Promise<void>;
}
export type PsPathPointReadableKey = "typename" | "parent" | "anchor" | "kind" | "leftDirection" | "rightDirection";

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
 * Remote proxy for a Photoshop `Document`. Getters resolve asynchronously over the bridge;
 * writable properties are set fire-and-forget with read-your-writes ordering.
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
  readonly guides: Promise<Guides>;
  readonly pathItems: Promise<PathItems>;
  readonly selection: Promise<PsSelection>;
  readonly historyStates: Promise<HistoryStates>;
  activeHistoryState: Promise<PsHistoryState>;
  activeHistoryBrushSource: Promise<PsHistoryState>;

  // Mutating method (native duplicate changes Photoshop state and requires modal execution)
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
  activeHistoryState: PsHistoryState;
  activeHistoryBrushSource: PsHistoryState;
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
  translate(
    horizontal: number | PercentValue | PixelValue,
    vertical: number | PercentValue | PixelValue
  ): Promise<void>;
  flip(axis: FlipAxisValue): Promise<void>;
  scale(
    width: number | PercentValue,
    height: number | PercentValue,
    anchor?: AnchorPositionValue
  ): Promise<void>;
  rotate(angle: number | AngleValue, anchor?: AnchorPositionValue): Promise<void>;
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

/** @deprecated Pass a {@link UxpStorageFile}; retained for bridge source compatibility. */
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

export interface Documents extends ReadonlyArray<PsDocument> {
  readonly parent: PhotoshopApp;
  readonly typename: "Documents";
  getByName(name: string): Promise<PsDocument | null>;
  add(options?: DocumentCreateOptions): Promise<PsDocument | null>;
}

export interface TextFont {
  readonly family: Promise<string>;
  readonly name: Promise<string>;
  readonly parent: Promise<PhotoshopApp>;
  readonly postScriptName: Promise<string>;
  readonly style: Promise<string>;
  readonly typename: Promise<"TextFont">;
  batchGet<K extends TextFontReadableKey>(propertyNames: readonly K[]): Promise<Record<K, unknown>>;
}
export type TextFontReadableKey = "family" | "name" | "parent" | "postScriptName" | "style" | "typename";

export interface TextFonts extends ReadonlyArray<TextFont> {
  readonly parent: PhotoshopApp;
  readonly typename: "TextFonts";
  getByName(name: string): Promise<TextFont | null>;
}

export interface Tool {
  get id(): Promise<string>;
  set id(value: string);
  readonly typename: Promise<"Tool">;
  batchGet(propertyNames: readonly ("id" | "typename")[]): Promise<Record<string, unknown>>;
  batchSet(properties: { readonly id?: string }): void;
}

export interface ActionSet {
  readonly typename: Promise<"ActionSet">;
  readonly index: Promise<number>;
  readonly id: Promise<number>;
  get name(): Promise<string>;
  set name(value: string);
  readonly actions: Promise<readonly Action[]>;
  delete(): Promise<void>;
  duplicate(): Promise<ActionSet>;
  play(): Promise<void>;
}

export interface Action {
  readonly typename: Promise<"Action">;
  readonly id: Promise<number>;
  readonly index: Promise<number>;
  get name(): Promise<string>;
  set name(value: string);
  readonly parent: Promise<ActionSet>;
  delete(): Promise<void>;
  duplicate(): Promise<Action>;
  play(): Promise<void>;
}

export interface ColorPickerOption {
  readonly type: "photoshopPicker" | "systemPicker" | "pluginPicker";
  readonly pluginId?: string;
}

export interface PreferencesBase {
  readonly typename: Promise<string>;
  batchGet(propertyNames: readonly string[]): Promise<Record<string, unknown>>;
  batchSet(properties: Readonly<Record<string, unknown>>): void;
}

export interface Preferences {
  readonly typename: Promise<"Preferences">;
  readonly general: Promise<PreferencesGeneral>;
  readonly interface: Promise<PreferencesInterface>;
  readonly tools: Promise<PreferencesTools>;
  readonly history: Promise<PreferencesHistory>;
  readonly fileHandling: Promise<PreferencesFileHandling>;
  readonly performance: Promise<PreferencesPerformance>;
  readonly cursors: Promise<PreferencesCursors>;
  readonly transparencyAndGamut: Promise<PreferencesTransparencyAndGamut>;
  readonly unitsAndRulers: Promise<PreferencesUnitsAndRulers>;
  readonly guidesGridsAndSlices: Promise<PreferencesGuidesGridsAndSlices>;
  readonly type: Promise<PreferencesType>;
  readonly notifications: Promise<PreferencesNotifications>;
}

export interface PreferencesCursors extends PreferencesBase {
  readonly typename: Promise<"PreferencesCursors">;
  get paintingCursors(): Promise<PaintingCursorsValue>; set paintingCursors(value: PaintingCursorsValue);
  get otherCursors(): Promise<OtherCursorsValue>; set otherCursors(value: OtherCursorsValue);
}
export interface PreferencesFileHandling extends PreferencesBase {
  readonly typename: Promise<"PreferencesFileHandling">;
  get imagePreviews(): Promise<SavePreviewValue>; set imagePreviews(value: SavePreviewValue);
  get useLowerCaseExtension(): Promise<boolean>; set useLowerCaseExtension(value: boolean);
  get askBeforeSavingLayeredTIFF(): Promise<boolean>; set askBeforeSavingLayeredTIFF(value: boolean);
  get maximizeCompatibility(): Promise<MaximizeCompatibilityValue>; set maximizeCompatibility(value: MaximizeCompatibilityValue);
  get recentFileListMaximum(): Promise<number>; set recentFileListMaximum(value: number);
}
export interface PreferencesGeneral extends PreferencesBase {
  readonly typename: Promise<"PreferencesGeneral">;
  get colorPicker(): Promise<ColorPickerOption>; set colorPicker(value: ColorPickerOption);
  get imageInterpolation(): Promise<InterpolationMethodValue>; set imageInterpolation(value: InterpolationMethodValue);
  get exportClipboard(): Promise<boolean>; set exportClipboard(value: boolean);
  get autoUpdateOpenDocuments(): Promise<boolean>; set autoUpdateOpenDocuments(value: boolean);
  get beepWhenDone(): Promise<boolean>; set beepWhenDone(value: boolean);
}
export interface PreferencesGuidesGridsAndSlices extends PreferencesBase {
  readonly typename: Promise<"PreferencesGuidesGridsAndSlices">;
  get guideStyle(): Promise<GuideLineStyleValue>; set guideStyle(value: GuideLineStyleValue);
  get gridStyle(): Promise<GridLineStyleValue>; set gridStyle(value: GridLineStyleValue);
  get gridSubDivisions(): Promise<number>; set gridSubDivisions(value: number);
  get showSliceNumber(): Promise<boolean>; set showSliceNumber(value: boolean);
}
export interface PreferencesHistory extends PreferencesBase {
  readonly typename: Promise<"PreferencesHistory">;
  get createFirstSnapshot(): Promise<boolean>; set createFirstSnapshot(value: boolean);
  get nonLinearHistory(): Promise<boolean>; set nonLinearHistory(value: boolean);
  get numberOfHistoryStates(): Promise<number>; set numberOfHistoryStates(value: number);
  get useHistoryLog(): Promise<boolean>; set useHistoryLog(value: boolean);
  get editLogItems(): Promise<EditLogItemsTypeValue>; set editLogItems(value: EditLogItemsTypeValue);
  get saveLogItems(): Promise<SaveLogItemsTypeValue>; set saveLogItems(value: SaveLogItemsTypeValue);
}
export interface PreferencesInterface extends PreferencesBase {
  readonly typename: Promise<"PreferencesInterface">;
  get dynamicColorSliders(): Promise<boolean>; set dynamicColorSliders(value: boolean);
  get textFontSize(): Promise<FontSizeValue>; set textFontSize(value: FontSizeValue);
  get colorChannelsInColor(): Promise<boolean>; set colorChannelsInColor(value: boolean);
}
export interface PreferencesNotifications extends PreferencesBase {
  readonly typename: Promise<"PreferencesNotifications">;
  get quietMode(): Promise<boolean>; set quietMode(value: boolean);
  get showFeatureOnboarding(): Promise<boolean>; set showFeatureOnboarding(value: boolean);
  get showToolTips(): Promise<boolean>; set showToolTips(value: boolean);
  get showWhatsNew(): Promise<boolean>; set showWhatsNew(value: boolean);
  get useRichToolTips(): Promise<boolean>; set useRichToolTips(value: boolean);
}
export interface PreferencesPerformance extends PreferencesBase {
  readonly typename: Promise<"PreferencesPerformance">;
  get imageCacheLevels(): Promise<number>; set imageCacheLevels(value: number);
  get maxRAMuse(): Promise<number>; set maxRAMuse(value: number);
}
export interface PreferencesTools extends PreferencesBase {
  readonly typename: Promise<"PreferencesTools">;
  get showToolTips(): Promise<boolean>; set showToolTips(value: boolean);
  get useShiftKeyForToolSwitch(): Promise<boolean>; set useShiftKeyForToolSwitch(value: boolean);
  get keyboardZoomResizesWindows(): Promise<boolean>; set keyboardZoomResizesWindows(value: boolean);
}
export interface PreferencesTransparencyAndGamut extends PreferencesBase {
  readonly typename: Promise<"PreferencesTransparencyAndGamut">;
  get gridSize(): Promise<GridSizeValue>; set gridSize(value: GridSizeValue);
  get gamutWarningOpacity(): Promise<number>; set gamutWarningOpacity(value: number);
}
export interface PreferencesType extends PreferencesBase {
  readonly typename: Promise<"PreferencesType">;
  get showTextFeatures(): Promise<TypeInterfaceFeaturesValue>; set showTextFeatures(value: TypeInterfaceFeaturesValue);
  get showEnglishFontNames(): Promise<boolean>; set showEnglishFontNames(value: boolean);
  get smartQuotes(): Promise<boolean>; set smartQuotes(value: boolean);
}
export interface PreferencesUnitsAndRulers extends PreferencesBase {
  readonly typename: Promise<"PreferencesUnitsAndRulers">;
  get rulerUnits(): Promise<RulerUnitsValue>; set rulerUnits(value: RulerUnitsValue);
  get typeUnits(): Promise<TypeUnitsValue>; set typeUnits(value: TypeUnitsValue);
  get pointSize(): Promise<PointTypeValue>; set pointSize(value: PointTypeValue);
}

/** The complete documented `photoshop.app` remote surface. */
export interface PhotoshopApp {
  readonly typename: Promise<"Photoshop">;
  readonly preferences: Promise<Preferences>;
  get displayDialogs(): Promise<DialogModesValue>;
  set displayDialogs(value: DialogModesValue);
  get activeDocument(): Promise<PsDocument>;
  set activeDocument(value: PsDocument);
  readonly currentTool: Promise<Tool>;
  readonly actionTree: Promise<readonly ActionSet[]>;
  readonly documents: Promise<Documents>;
  get foregroundColor(): Promise<PsSolidColor>;
  set foregroundColor(value: SolidColorInput);
  get backgroundColor(): Promise<PsSolidColor>;
  set backgroundColor(value: SolidColorInput);
  readonly fonts: Promise<TextFonts>;
  readonly SolidColor: typeof import("./solid-color.js").SolidColor;
  getColorProfiles(colorMode?: string): Promise<string[]>;
  convertUnits(fromValue: number, fromUnits: UnitsValue, toUnits: UnitsValue, resolution?: number): Promise<number>;
  showAlert(message: string): Promise<void>;
  batchPlay(commands: readonly ActionDescriptor[], options?: BatchPlayCommandOptions): Promise<ActionDescriptor[]>;
  bringToFront(): Promise<void>;
  open(entry?: UxpStorageFile | OpenOptions): Promise<PsDocument>;
  createDocument(options?: DocumentCreateOptions): Promise<PsDocument | null>;
  updateUI(): Promise<void>;
  batchGet(propertyNames: readonly string[]): Promise<Record<string, unknown>>;
  batchSet(properties: Readonly<Record<string, unknown>>): void;
}

/** Exact Adobe class name; PhotoshopApp remains as the compatibility name. */
export type Photoshop = PhotoshopApp;

/** The `photoshop` namespace: app entry plus every synchronous Photoshop enum table. */
export interface PhotoshopNamespace extends PhotoshopConstantsNamespace {
  readonly app: PhotoshopApp;
  readonly action: PhotoshopActions;
  readonly core: PhotoshopCore;
  readonly ColorConversionModel: typeof ColorConversionModel;
  readonly imaging: PhotoshopImaging;
  readonly preferences: Promise<Preferences>;
  readonly preferencesCursors: Promise<PreferencesCursors>;
  readonly preferencesFileHandling: Promise<PreferencesFileHandling>;
  readonly preferencesGeneral: Promise<PreferencesGeneral>;
  readonly preferencesGuidesGridsAndSlices: Promise<PreferencesGuidesGridsAndSlices>;
  readonly preferencesHistory: Promise<PreferencesHistory>;
  readonly preferencesInterface: Promise<PreferencesInterface>;
  readonly preferencesNotifications: Promise<PreferencesNotifications>;
  readonly preferencesPerformance: Promise<PreferencesPerformance>;
  readonly preferencesTools: Promise<PreferencesTools>;
  readonly preferencesTransparencyAndGamut: Promise<PreferencesTransparencyAndGamut>;
  readonly preferencesType: Promise<PreferencesType>;
  readonly preferencesUnitsAndRulers: Promise<PreferencesUnitsAndRulers>;
  /** Native-compatible aggregate for callers that use `photoshop.constants.Xxx`. */
  readonly constants: PhotoshopConstantsNamespace;
}
