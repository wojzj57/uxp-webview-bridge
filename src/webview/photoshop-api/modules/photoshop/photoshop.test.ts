/**
 * Photoshop module tests (RFC-0007).
 *
 * This file carries two independent test layers that share one location:
 *
 * 1. **Static consistency (compile-time only).** Module-scope `type`-level assertions that run under
 *    `pnpm typecheck` and the CDP webview tsc project. They emit no runtime code (all relative
 *    imports are `type`-only, as the static boundary checker requires for WebView CDP test files):
 *      - the transcribed `as const` constant unions stay compatible with Adobe's real DOM enums;
 *      - `batchSet` rejects read-only properties at compile time;
 *      - the `declare` member key sets of `PsDocument`/`PsLayer` match the descriptor-table key sets
 *        that back them (the double-write guard the spec mandates for ADR 0002).
 *    The *runtime* half of the descriptor<->declare lock lives in
 *    `test/contract/photoshop-remote-consistency.test.mjs` (it needs the built classes).
 *
 * 2. **Co-located CDP cases (real Photoshop via `test:uxp`).** The eight `photoshop.`-prefixed cases
 *    below exercise the live bridge, following the `fs.test.ts`/`uxp.test.ts` conventions
 *    (`bridge.ensureConfigured()`, `assert`, `skip`, best-effort cleanup). They only ever touch
 *    `ctx.bridge`; the Adobe host owns all real Photoshop work.
 */

import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

// --- Static layer: type-only imports (erased at runtime; allowed by the static boundary checker) ---
import type {
  AnchorPosition as AdobeAnchorPosition,
  BlendMode as AdobeBlendMode,
  ChannelType as AdobeChannelType,
  ElementPlacement as AdobeElementPlacement,
  FlipAxis as AdobeFlipAxis,
  LayerKind as AdobeLayerKind,
  SaveOptions as AdobeSaveOptions
} from "@shared/types/photoshop/internal/dom/Constants.js";
import type * as AdobeConstants from "@shared/types/photoshop/internal/dom/Constants.js";
import type {
  AngleValue as AdobeAngleValue,
  CentimeterValue as AdobeCentimeterValue,
  DensityValue as AdobeDensityValue,
  DistanceValue as AdobeDistanceValue,
  InchValue as AdobeInchValue,
  MillimeterValue as AdobeMillimeterValue,
  PercentValue as AdobePercentValue,
  PicaValue as AdobePicaValue,
  PixelValue as AdobePixelValue,
  PointValue as AdobePointValue,
  UnitTypeEnum as AdobeUnitTypeEnum,
  UnitValue as AdobeUnitValue
} from "@shared/types/photoshop/internal/util/unit.js";
import type {
  AnchorPositionValue,
  BlendModeValue,
  ChannelTypeValue,
  ElementPlacementValue,
  FlipAxisValue,
  LayerKindValue,
  PhotoshopConstantsNamespace,
  SaveOptionsValue
} from "@shared/photoshop-api/photoshop-constants.js";
import type {
  ActionDescriptor as AdobeActionDescriptor,
  ActionReference as AdobeActionReference,
  BatchPlayCommandOptions as AdobeBatchPlayCommandOptions
} from "@shared/types/photoshop/internal/dom/CoreModules.js";
import type { Layer as AdobeLayer } from "@shared/types/photoshop/internal/dom/Layer.js";
import type { TextItem as AdobeTextItem } from "@shared/types/photoshop/internal/dom/TextItem.js";
import type { CharacterStyle as AdobeCharacterStyle } from "@shared/types/photoshop/internal/dom/text/CharacterStyle.js";
import type { ParagraphStyle as AdobeParagraphStyle } from "@shared/types/photoshop/internal/dom/text/ParagraphStyle.js";
import type { TextWarpStyle as AdobeTextWarpStyle } from "@shared/types/photoshop/internal/dom/text/TextWarpStyle.js";
import type {
  CMYKColor as AdobeCMYKColor,
  GrayColor as AdobeGrayColor,
  HSBColor as AdobeHSBColor,
  LabColor as AdobeLabColor,
  RGBColor as AdobeRGBColor
} from "@shared/types/photoshop/internal/dom/objects/Colors.js";
import type { PathPointInfo as AdobePathPointInfo } from "@shared/types/photoshop/internal/dom/objects/PathPointInfo.js";
import type { SubPathInfo as AdobeSubPathInfo } from "@shared/types/photoshop/internal/dom/objects/SubPathInfo.js";
import type {
  CMYKColor as WebviewCMYKColor,
  GrayColor as WebviewGrayColor,
  HSBColor as WebviewHSBColor,
  LabColor as WebviewLabColor,
  RGBColor as WebviewRGBColor
} from "./color-models.js";
import type {
  PathPointInfo as WebviewPathPointInfo,
  SubPathInfo as WebviewSubPathInfo
} from "./path-builders.js";
import type {
  ActionDescriptor,
  ActionReference,
  AngleValue,
  BatchPlayCommandOptions,
  CentimeterValue,
  CharacterStyle,
  DensityValue,
  DistanceValue,
  InchValue,
  MillimeterValue,
  ParagraphStyle,
  PercentValue,
  PicaValue,
  PixelValue,
  PointValue,
  PsChannel,
  PsChannelReadableKey,
  PsChannelWritableProps,
  PsDocument,
  PsDocumentReadableKey,
  PsDocumentWritableProps,
  PsHistoryState,
  PsHistoryStateReadableKey,
  PsHistoryStateWritableProps,
  PsLayer,
  PsLayerReadableKey,
  PsLayerWritableProps,
  PsPathItem,
  PsSelection,
  PsSelectionReadableKey,
  PsSelectionWritableProps,
  PhotoshopNamespace,
  TextItem,
  TextWarpStyle,
  UnitTypeEnum,
  UnitValue
} from "./types.js";
import type { UxpStorageFile } from "@webview/uxp-api/modules/uxp/persistent-file-storage/types.js";

// ---------------------------------------------------------------------------------------------------
// Static consistency assertions (compile-time only)
// ---------------------------------------------------------------------------------------------------

/** Compiles only when `A` and `B` are mutually assignable (i.e. the same set of values). */
type AssertMutual<A extends B, B extends C, C = A> = true;

/**
 * Constant compatibility (ADR 0006 / RFC-0004).
 *
 * Strategy (RFC-0007 option "a"): the real Adobe enums are declared as `export enum` in
 * `src/shared/types/photoshop/internal/dom/Constants.d.ts`. We reach the enum *types* through the
 * runtime-free `@shared/*` alias with a `type`-only import.
 * `<Enum>[keyof <Enum>]` is the union of the enum's member *values*; each transcribed `...Value`
 * union must be mutually assignable to it. A drift in any hand-copied value fails to compile here.
 */
type _AnchorCompatible = AssertMutual<AnchorPositionValue, `${AdobeAnchorPosition}`>;
type _BlendModeCompatible = AssertMutual<BlendModeValue, `${AdobeBlendMode}`>;
type _LayerKindCompatible = AssertMutual<LayerKindValue, `${AdobeLayerKind}`>;
type _ElementPlacementCompatible = AssertMutual<ElementPlacementValue, `${AdobeElementPlacement}`>;
type _FlipAxisCompatible = AssertMutual<FlipAxisValue, `${AdobeFlipAxis}`>;
type _ChannelTypeCompatible = AssertMutual<ChannelTypeValue, `${AdobeChannelType}`>;

// SaveOptions is a numeric enum; its value union is numeric, so compare against the numeric enum
// value union directly rather than a template-literal (which only applies to string enums).
type _SaveOptionsExact = AssertMutual<SaveOptionsValue, AdobeSaveOptions>;

/** Every Adobe enum name is generated and carried by the public Photoshop namespace type. */
type AssertNever<T extends never> = true;
type _AllAdobeConstantNamesGenerated = AssertNever<
  Exclude<keyof typeof AdobeConstants, "constants" | keyof PhotoshopConstantsNamespace>
>;
type _NoGeneratedConstantNamesOutsideAdobe = AssertNever<
  Exclude<keyof PhotoshopConstantsNamespace, Exclude<keyof typeof AdobeConstants, "constants">>
>;
type _AllGeneratedConstantsPublic = AssertNever<
  Exclude<keyof PhotoshopConstantsNamespace, keyof PhotoshopNamespace>
>;

/** All 12 unit symbols are exact public aliases of Adobe's transport-safe unit value types. */
type _UnitTypeEnumExact = AssertMutual<UnitTypeEnum, AdobeUnitTypeEnum>;
type _UnitValueExact = AssertMutual<UnitValue, AdobeUnitValue>;
type _AngleValueExact = AssertMutual<AngleValue, AdobeAngleValue>;
type _DensityValueExact = AssertMutual<DensityValue, AdobeDensityValue>;
type _DistanceValueExact = AssertMutual<DistanceValue, AdobeDistanceValue>;
type _PercentValueExact = AssertMutual<PercentValue, AdobePercentValue>;
type _PixelValueExact = AssertMutual<PixelValue, AdobePixelValue>;
type _PointValueExact = AssertMutual<PointValue, AdobePointValue>;
type _MillimeterValueExact = AssertMutual<MillimeterValue, AdobeMillimeterValue>;
type _CentimeterValueExact = AssertMutual<CentimeterValue, AdobeCentimeterValue>;
type _InchValueExact = AssertMutual<InchValue, AdobeInchValue>;
type _PicaValueExact = AssertMutual<PicaValue, AdobePicaValue>;

/**
 * `batchSet` writability: passing a read-only property must be a compile-time error. `PsDocument.id`
 * and `PsLayer.id` are read-only, so the following are expected to fail to type-check.
 */
type _DocWritableIsExactlyWritable = AssertMutual<
  keyof PsDocumentWritableProps,
  "pixelAspectRatio" | "quickMaskMode" | "bitsPerChannel" | "colorProfileName" |
  "colorProfileType" | "activeLayers" | "activeChannels" | "activeHistoryState" |
  "activeHistoryBrushSource"
>;
type _LayerWritableExcludesReadonly = "id" extends keyof PsLayerWritableProps ? never : true;
const _layerWritableExcludesReadonly: _LayerWritableExcludesReadonly = true;
void _layerWritableExcludesReadonly;

/**
 * Descriptor <-> declare lock (type-level half).
 *
 * The runtime descriptor tables are keyed by the same names as the interface members; here we assert
 * that the *readable* key unions (which the descriptor tables enumerate) exactly match the readable
 * members declared on the interfaces. The runtime half in the contract test proves the tables agree
 * with these keys at runtime. Together they catch either side drifting.
 */
type PsDocumentReadableMembers = Exclude<
  keyof PsDocument,
  "duplicate" | "close" | "closeWithoutSaving" | "flatten" | "mergeVisibleLayers" | "revealAll" |
  "rasterizeAllLayers" | "crop" | "resizeCanvas" | "resizeImage" | "trim" | "rotate" | "save" |
  "createLayer" | "createPixelLayer" | "createTextLayer" | "createLayerGroup" | "groupLayers" |
  "duplicateLayers" | "linkLayers" | "paste" | "batchGet" | "batchSet" | "dispose" |
  "calculations" | "changeMode" | "convertProfile" | "generativeUpscale" | "sampleColor" |
  "splitChannels" | "trap" | "saveAs"
>;
type _DocReadableKeysLocked = AssertMutual<PsDocumentReadableMembers, PsDocumentReadableKey>;

type PsSelectionReadableMembers = Exclude<
  keyof PsSelection,
  "contract" | "deselect" | "expand" | "feather" | "grow" | "inverse" | "load" |
  "makeWorkPath" | "selectAll" | "selectRectangle" | "selectEllipse" | "selectPolygon" |
  "selectRow" | "selectColumn" | "save" | "saveTo" | "selectBorder" | "smooth" |
  "translateBoundary" | "resizeBoundary" | "rotateBoundary" | "batchGet" | "batchSet" | "dispose"
>;
type _SelectionReadableKeysLocked = AssertMutual<PsSelectionReadableMembers, PsSelectionReadableKey>;
type _SelectionRejectsWrites = AssertMutual<
  { solid: boolean } extends PsSelectionWritableProps ? false : true,
  true
>;

type PsHistoryStateReadableMembers = Exclude<keyof PsHistoryState, "batchGet" | "batchSet" | "dispose">;
type _HistoryStateReadableKeysLocked = AssertMutual<PsHistoryStateReadableMembers, PsHistoryStateReadableKey>;
type _HistoryStateRejectsWrites = AssertMutual<
  { name: string } extends PsHistoryStateWritableProps ? false : true,
  true
>;

type PsLayerReadableMembers = Exclude<
  keyof PsLayer,
  "delete" | "duplicate" | "link" | "unlink" | "move" | "translate" | "flip" | "scale" | "rotate" |
  "merge" | "rasterize" | "batchGet" | "batchSet" | "dispose" | "bringToFront" | "sendToBack" |
  "skew" | "clear" | "copy" | "cut" | "applyAddNoise" | "applyAverage" | "applyBlur" |
  "applyBlurMore" | "applyClouds" | "applyCustomFilter" | "applyDeInterlace" | "applyDespeckle" |
  "applyDifferenceClouds" | "applyDiffuseGlow" | "applyDisplace" | "applyDustAndScratches" |
  "applyGaussianBlur" | "applyGlassEffect" | "applyHighPass" | "applyLensBlur" | "applyLensFlare" |
  "applyMaximum" | "applyMinimum" | "applyMedianNoise" | "applyMotionBlur" | "applyNTSC" |
  "applyOceanRipple" | "applyOffset" | "applyTwirl" | "applyPinch" | "applyPolarCoordinates" |
  "applyRipple" | "applySharpen" | "applySharpenEdges" | "applySharpenMore" | "applyShear" |
  "applySmartBlur" | "applySpherize" | "applyUnSharpMask" | "applyWave" | "applyZigZag" | "applyImage"
>;
type _LayerReadableKeysLocked = AssertMutual<PsLayerReadableMembers, PsLayerReadableKey>;

/** Exact public class key coverage against the vendored Photoshop declarations. */
type RemoteInfrastructureMembers = "batchGet" | "batchSet" | "dispose";
type _LayerClassKeysExact = AssertMutual<
  Exclude<keyof PsLayer, RemoteInfrastructureMembers>,
  Exclude<keyof AdobeLayer, `_${string}`>
>;
type _TextItemClassKeysExact = AssertMutual<Exclude<keyof TextItem, RemoteInfrastructureMembers>, keyof AdobeTextItem>;
type _CharacterStyleClassKeysExact = AssertMutual<
  Exclude<keyof CharacterStyle, RemoteInfrastructureMembers>,
  keyof AdobeCharacterStyle
>;
type _ParagraphStyleClassKeysExact = AssertMutual<
  Exclude<keyof ParagraphStyle, RemoteInfrastructureMembers>,
  keyof AdobeParagraphStyle
>;
type _TextWarpStyleClassKeysExact = AssertMutual<
  Exclude<keyof TextWarpStyle, RemoteInfrastructureMembers>,
  keyof AdobeTextWarpStyle
>;
type _PathPointInfoClassKeysExact = AssertMutual<
  Exclude<keyof WebviewPathPointInfo, "toInputData">,
  keyof AdobePathPointInfo
>;
type _SubPathInfoClassKeysExact = AssertMutual<
  Exclude<keyof WebviewSubPathInfo, "toInputData">,
  keyof AdobeSubPathInfo
>;
type _CMYKColorClassKeysExact = AssertMutual<keyof WebviewCMYKColor, keyof AdobeCMYKColor>;
type _GrayColorClassKeysExact = AssertMutual<keyof WebviewGrayColor, keyof AdobeGrayColor>;
type _HSBColorClassKeysExact = AssertMutual<keyof WebviewHSBColor, keyof AdobeHSBColor>;
type _LabColorClassKeysExact = AssertMutual<keyof WebviewLabColor, keyof AdobeLabColor>;
type _RGBColorClassKeysExact = AssertMutual<keyof WebviewRGBColor, keyof AdobeRGBColor>;

type PsChannelReadableMembers = Exclude<
  keyof PsChannel,
  "duplicate" | "merge" | "remove" | "batchGet" | "batchSet" | "dispose" | "parent"
>;
type _ChannelReadableKeysLocked = AssertMutual<PsChannelReadableMembers, PsChannelReadableKey>;

// `color` is the sole non-scalar writable; assert the writable key set matches the declared props.
type _ChannelWritableIsExactlyWritable = AssertMutual<
  keyof PsChannelWritableProps,
  "name" | "opacity" | "visible" | "kind" | "color"
>;

/**
 * batchPlay descriptor/option compatibility (ADR 0010 / RFC-0009).
 *
 * `photoshop.action.batchPlay` transports descriptors verbatim to Adobe's real `batchPlay`, so our
 * locally-declared shapes must stay assignable to Adobe's `ActionDescriptor` / `BatchPlayCommandOptions`
 * (reached through the working `@shared/*` alias, since the `@shared-types/photoshop/*` alias is
 * broken — same strategy as the enum checks above). If a field drifts so our value would no longer
 * satisfy Adobe's API, these fail to compile. `ActionDescriptor` is checked both ways because a
 * host result descriptor we return must also be usable as an input descriptor.
 */
type Assignable<From, To> = [From] extends [To] ? true : never;
type _DescriptorToAdobe = Assignable<ActionDescriptor, AdobeActionDescriptor>;
type _DescriptorFromAdobe = Assignable<AdobeActionDescriptor, ActionDescriptor>;
type _ReferenceToAdobe = Assignable<ActionReference, AdobeActionReference>;
type _ReferenceFromAdobe = Assignable<AdobeActionReference, ActionReference>;
type _OptionsToAdobe = Assignable<BatchPlayCommandOptions, AdobeBatchPlayCommandOptions>;

// Reference the compile-time-only aliases so `noUnusedLocals`-style tools (should they ever be
// enabled) do not strip them; `type` aliases are erased regardless.
export type _StaticConsistencyProof = [
  _SaveOptionsExact,
  _AnchorCompatible,
  _BlendModeCompatible,
  _LayerKindCompatible,
  _ElementPlacementCompatible,
  _FlipAxisCompatible,
  _ChannelTypeCompatible,
  _AllAdobeConstantNamesGenerated,
  _NoGeneratedConstantNamesOutsideAdobe,
  _AllGeneratedConstantsPublic,
  _UnitTypeEnumExact,
  _UnitValueExact,
  _AngleValueExact,
  _DensityValueExact,
  _DistanceValueExact,
  _PercentValueExact,
  _PixelValueExact,
  _PointValueExact,
  _MillimeterValueExact,
  _CentimeterValueExact,
  _InchValueExact,
  _PicaValueExact,
  _DocWritableIsExactlyWritable,
  _DocReadableKeysLocked,
  _SelectionReadableKeysLocked,
  _SelectionRejectsWrites,
  _HistoryStateReadableKeysLocked,
  _HistoryStateRejectsWrites,
  _LayerReadableKeysLocked,
  _LayerClassKeysExact,
  _TextItemClassKeysExact,
  _CharacterStyleClassKeysExact,
  _ParagraphStyleClassKeysExact,
  _TextWarpStyleClassKeysExact,
  _PathPointInfoClassKeysExact,
  _SubPathInfoClassKeysExact,
  _CMYKColorClassKeysExact,
  _GrayColorClassKeysExact,
  _HSBColorClassKeysExact,
  _LabColorClassKeysExact,
  _RGBColorClassKeysExact,
  _ChannelReadableKeysLocked,
  _ChannelWritableIsExactlyWritable,
  _DescriptorToAdobe,
  _DescriptorFromAdobe,
  _ReferenceToAdobe,
  _ReferenceFromAdobe,
  _OptionsToAdobe
];

// ---------------------------------------------------------------------------------------------------
// CDP cases (real Photoshop host)
// ---------------------------------------------------------------------------------------------------

const SIX_BOUNDS_FIELDS = ["left", "right", "top", "bottom", "width", "height"] as const;
const COMPLETE_LAYER_MEMBERS = [
  "typename", "locked", "allLocked", "pixelsLocked", "positionLocked", "transparentPixelsLocked",
  "isBackgroundLayer", "visible", "kind", "bounds", "boundsNoEffects", "opacity", "fillOpacity",
  "filterMaskDensity", "filterMaskFeather", "layerMaskDensity", "layerMaskFeather", "vectorMaskDensity",
  "vectorMaskFeather", "isClippingMask", "blendMode", "linkedLayers", "name", "id", "document", "parent",
  "textItem", "layers", "applyAddNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds",
  "applyCustomFilter", "applyDeInterlace", "applyDespeckle", "applyDifferenceClouds", "applyDiffuseGlow",
  "applyDisplace", "applyDustAndScratches", "applyGaussianBlur", "applyGlassEffect", "applyHighPass",
  "applyLensBlur", "applyLensFlare", "applyMaximum", "applyMinimum", "applyMedianNoise", "applyMotionBlur",
  "applyNTSC", "applyOceanRipple", "applyOffset", "applyTwirl", "applyPinch", "applyPolarCoordinates",
  "applyRipple", "applySharpen", "applySharpenEdges", "applySharpenMore", "applyShear", "applySmartBlur",
  "applySpherize", "applyUnSharpMask", "applyWave", "applyZigZag", "applyImage", "delete", "duplicate",
  "link", "unlink", "move", "bringToFront", "sendToBack", "translate", "flip", "scale", "rotate", "skew",
  "clear", "copy", "cut", "merge", "rasterize"
] as const;
const COMPLETE_CHARACTER_STYLE_MEMBERS = [
  "font", "size", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "useAutoLeading", "leading",
  "tracking", "baselineShift", "horizontalDiacriticPosition", "verticalDiacriticPosition", "autoKerning",
  "capitalization", "baseline", "strikeThrough", "underline", "ligatures", "alternateLigatures", "fractions",
  "ordinals", "swash", "titlingAlternates", "stylisticAlternates", "language", "characterAlignment", "noBreak",
  "color", "kashidas", "middleEasternTextDirection", "middleEasternDigitsType", "fractionalWidths",
  "antiAliasMethod", "reset"
] as const;
const COMPLETE_PARAGRAPH_STYLE_MEMBERS = [
  "justification", "justificationFeatures", "leftIndent", "rightIndent", "firstLineIndent", "spaceBefore",
  "kashidaWidth", "kinsoku", "mojikumi", "spaceAfter", "hyphenation", "hyphenationFeatures", "layoutMode",
  "features", "reset"
] as const;
const COMPLETE_WARP_STYLE_MEMBERS = [
  "style", "direction", "bend", "horizontalDistortion", "verticalDistortion", "reset"
] as const;
const COMPLETE_TEXT_ITEM_MEMBERS = [
  "parent", "typename", "contents", "textClickPoint", "orientation", "isPointText", "isParagraphText",
  "characterStyle", "paragraphStyle", "warpStyle", "convertToParagraphText", "convertToPointText",
  "convertToShape", "createWorkPath"
] as const;

export default defineWebviewCdpCases([
  {
    name: "photoshop.public-shape",
    run({ bridge, assert, hostDiagnostics, reportDiagnostics }) {
      const photoshop = bridge.photoshop;
      assert.ok(typeof photoshop === "object" && photoshop !== null, "bridge.photoshop must be an object.");
      assert.ok(typeof photoshop.app === "object" && photoshop.app !== null, "photoshop.app must be an object.");
      assert.functions(photoshop.app, ["open"], "photoshop.app");
      assert.ok("activeDocument" in photoshop.app, "photoshop.app.activeDocument must exist.");
      assert.ok("documents" in photoshop.app, "photoshop.app.documents must exist.");

      assert.ok(typeof photoshop.action === "object" && photoshop.action !== null, "photoshop.action must be an object.");
      assert.functions(
        photoshop.action,
        ["batchPlay", "batchPlaySync", "getIDFromString", "recordAction", "validateReference"],
        "photoshop.action"
      );

      const constantEntries = Object.entries(photoshop).filter(
        ([name]) => name === "ColorConversionModel" || name in photoshop.constants
      );
      assert.equal(
        constantEntries.length,
        103,
        "photoshop must synchronously expose 102 Constants.d.ts enums plus ColorConversionModel."
      );
      for (const [name, table] of constantEntries) {
        assert.ok(typeof table === "object" && table !== null, `photoshop.${name} must be an object.`);
        assert.equal(
          typeof (table as { then?: unknown }).then,
          "undefined",
          `photoshop.${name} must not be Promise-like.`
        );
      }
      assert.equal(Object.keys(photoshop.constants).length, 102, "photoshop.constants must contain every declared enum.");
      assert.equal(photoshop.constants.LayerKind, photoshop.LayerKind, "aggregate and direct tables must share identity.");
      assert.equal(photoshop.InterpolationMethod.AUTOMATIC, "bicubicAutomatic", "InterpolationMethod should be present.");
      assert.equal(photoshop.LayerKind.NORMAL, "pixel", "LayerKind.NORMAL should transcribe to 'pixel'.");
      assert.equal(photoshop.BlendMode.SUBTRACT, "blendSubtraction", "BlendMode.SUBTRACT should transcribe correctly.");
      assert.equal(photoshop.SaveOptions.DONOTSAVECHANGES, 0, "SaveOptions.DONOTSAVECHANGES should be 0.");
      assert.equal(photoshop.GridSize.DOTTED, undefined, "GridSize must not acquire GridLineStyle members.");
      assert.equal(photoshop.GenerativeUpscaleModel.FIREFLY, "firefly", "the final declaration enum should be present.");

      const diagnostics = hostDiagnostics as {
        __UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS__?: Record<string, Record<string, string | number>>;
        __UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS_ERROR__?: string;
      };
      assert.equal(
        diagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS_ERROR__,
        undefined,
        "the UXP fixture must be able to snapshot native Photoshop constants."
      );
      const nativeConstants = diagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS__;
      assert.ok(nativeConstants && typeof nativeConstants === "object", "native Photoshop constants snapshot must exist.");
      let nativeMembersChecked = 0;
      for (const [enumName, nativeEnum] of Object.entries(nativeConstants ?? {})) {
        const webviewEnum = photoshop.constants[enumName];
        assert.ok(webviewEnum && typeof webviewEnum === "object", `native enum ${enumName} must exist in WebView constants.`);
        for (const [memberName, nativeValue] of Object.entries(nativeEnum)) {
          assert.equal(
            webviewEnum[memberName],
            nativeValue,
            `photoshop.constants.${enumName}.${memberName} must match the native UXP runtime.`
          );
          nativeMembersChecked += 1;
        }
      }
      reportDiagnostics({
        nativePhotoshopEnumsChecked: Object.keys(nativeConstants ?? {}).length,
        nativePhotoshopMembersChecked: nativeMembersChecked
      });

      return {
        declaredEnumsChecked: Object.keys(photoshop.constants).length,
        publicConstantTypesChecked: constantEntries.length,
        nativeEnumsChecked: Object.keys(nativeConstants ?? {}).length,
        nativeMembersChecked
      };
    }
  },
  {
    name: "photoshop.app-complete-surface",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      const app = bridge.photoshop.app;
      const documentedMembers = [
        "typename", "preferences", "displayDialogs", "activeDocument", "getColorProfiles", "currentTool",
        "actionTree", "documents", "foregroundColor", "convertUnits", "backgroundColor", "fonts",
        "showAlert", "batchPlay", "bringToFront", "open", "createDocument", "updateUI"
      ];
      for (const member of documentedMembers) assert.ok(member in app, `photoshop.app.${member} must exist.`);
      assert.equal(await app.typename, "Photoshop", "app.typename should resolve to Photoshop.");

      const profiles = await app.getColorProfiles("RGB");
      assert.ok(Array.isArray(profiles), "app.getColorProfiles should return an array.");
      const fonts = await app.fonts;
      assert.equal(fonts.typename, "TextFonts", "app.fonts should decode to TextFonts.");
      assert.equal(fonts.parent, app, "TextFonts.parent should preserve app identity.");
      if (fonts[0]) {
        assert.nonEmptyString(await fonts[0].postScriptName, "TextFont.postScriptName");
        assert.equal(await fonts[0].parent, app, "TextFont.parent should preserve app identity.");
      }
      const tool = await app.currentTool;
      assert.equal(await tool.typename, "Tool", "currentTool should decode to Tool.");
      const [foregroundColor, backgroundColor] = await Promise.all([app.foregroundColor, app.backgroundColor]);
      assert.equal(foregroundColor.typename, "SolidColor", "foregroundColor should decode to SolidColor.");
      assert.equal(backgroundColor.typename, "SolidColor", "backgroundColor should decode to SolidColor.");
      assert.equal(foregroundColor.rgb.typename, "RGBColor", "SolidColor.rgb should decode to the RGBColor value class.");
      assert.ok(
        foregroundColor.rgb instanceof bridge.photoshop.RGBColor,
        "SolidColor.rgb should preserve the public RGBColor constructor identity."
      );
      assert.ok(/^([0-9A-F]{6})$/.test(foregroundColor.nearestWebColor.hexValue), "nearestWebColor should expose a hex value.");

      try {
        const preferences = await app.preferences;
        assert.equal(await preferences.typename, "Preferences", "app.preferences should decode to Preferences.");
        const general = await preferences.general;
        assert.equal(await general.typename, "PreferencesGeneral", "preferences.general should decode correctly.");
        assert.equal(typeof await general.exportClipboard, "boolean", "a general preference should be readable.");
      } catch (error) {
        return skip("Photoshop runtime does not expose Preferences (requires Photoshop 24+).", { error: normalizeError(error) });
      }

      const actionTree = await app.actionTree;
      assert.ok(Array.isArray(actionTree), "app.actionTree should be an array snapshot.");
      await app.updateUI();
      return { members: documentedMembers.length, profiles: profiles.length, fonts: fonts.length, actionSets: actionTree.length, foreground: foregroundColor.rgb.hexValue };
    }
  },
  {
    name: "photoshop.app-create-document",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      const name = `uxp-bridge-app-${Date.now()}`;
      let document: PsDocument | null | undefined;
      try {
        document = await bridge.photoshop.app.createDocument({ name, width: 32, height: 24, resolution: 72 });
        if (!document) return skip("app.createDocument returned null.");
        assert.equal(await document.name, name, "created document should retain its requested name.");
        const documents = await bridge.photoshop.app.documents;
        assert.equal(documents.typename, "Documents", "app.documents should decode to Documents.");
        assert.equal(documents.parent, bridge.photoshop.app, "Documents.parent should preserve app identity.");
        assert.equal(await documents.getByName(name), document, "Documents.getByName should preserve Document identity.");
        return { name, documentId: await document.id, documents: documents.length };
      } finally {
        await closeDocumentQuietly(document ?? undefined);
      }
    }
  },
  {
    name: "photoshop.app-methods-and-writes",
    timeoutMs: 45_000,
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      const photoshop = bridge.photoshop;
      const app = photoshop.app;
      const originalDialogs = await app.displayDialogs;
      const originalForeground = await app.foregroundColor;
      const originalBackground = await app.backgroundColor;
      let first: PsDocument | null | undefined;
      let second: PsDocument | null | undefined;
      try {
        first = await app.createDocument({
          name: `uxp-bridge-app-methods-a-${Date.now()}`,
          width: 32,
          height: 24,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE
        });
        second = await app.createDocument({
          name: `uxp-bridge-app-methods-b-${Date.now()}`,
          width: 16,
          height: 16,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.BLACK
        });
        if (!first || !second) return skip("Photoshop could not create both disposable app-method documents.");

        const inches = await app.convertUnits(72, photoshop.Units.PIXELS, photoshop.Units.INCHES, 72);
        assert.ok(Math.abs(inches - 1) < 0.0001, "app.convertUnits should convert 72 px at 72 ppi to one inch.");

        app.displayDialogs = originalDialogs;
        assert.equal(await app.displayDialogs, originalDialogs, "displayDialogs should support an ordered write/read round-trip.");

        app.activeDocument = first;
        assert.equal(await app.activeDocument, first, "activeDocument should switch to the first disposable document.");
        app.activeDocument = second;
        assert.equal(await app.activeDocument, second, "activeDocument should switch to the second disposable document.");

        app.foregroundColor = { rgb: { red: 12, green: 34, blue: 56 } };
        assert.equal((await app.foregroundColor).rgb.hexValue, "0C2238", "foregroundColor should round-trip through SolidColorInput.");
        app.backgroundColor = { rgb: { red: 210, green: 180, blue: 140 } };
        assert.equal((await app.backgroundColor).rgb.hexValue, "D2B48C", "backgroundColor should round-trip through SolidColorInput.");

        const documentId = await second.id;
        const [descriptor] = await app.batchPlay([
          { _obj: "get", _target: [{ _ref: "document", _id: documentId }] }
        ], { dialogOptions: "silent" });
        assert.ok(typeof descriptor === "object" && descriptor !== null, "app.batchPlay should return a descriptor.");
        assert.equal(descriptor.documentID, documentId, "app.batchPlay should address the disposable document by native id.");

        await app.bringToFront();
        await app.updateUI();
        return {
          methods: ["convertUnits", "batchPlay", "bringToFront", "createDocument", "updateUI"],
          writes: ["displayDialogs", "activeDocument", "foregroundColor", "backgroundColor"]
        };
      } finally {
        try { app.displayDialogs = originalDialogs; await app.displayDialogs; } catch {}
        try { app.foregroundColor = originalForeground; await app.foregroundColor; } catch {}
        try { app.backgroundColor = originalBackground; await app.backgroundColor; } catch {}
        await closeDocumentQuietly(second ?? undefined);
        await closeDocumentQuietly(first ?? undefined);
      }
    }
  },
  {
    name: "photoshop.document-read",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const [id, name, width, height] = await Promise.all([
        document.id,
        document.name,
        document.width,
        document.height
      ]);

      assert.ok(typeof id === "number", "document.id should resolve to a number.");
      assert.nonEmptyString(name, "document.name");
      assert.ok(typeof width === "number" && width > 0, "document.width should be a positive number.");
      assert.ok(typeof height === "number" && height > 0, "document.height should be a positive number.");

      return { id, name, width, height };
    }
  },
  {
    name: "photoshop.layer-read-write",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const originalName = await layer.name;
      assert.ok(typeof originalName === "string", "layer.name should resolve to a string.");

      const originalOpacity = await layer.opacity;
      assert.ok(typeof originalOpacity === "number", "layer.opacity should resolve to a number.");

      const target = originalOpacity >= 50 ? 25 : 75;
      // The getter is typed `Promise<number>`, but the fire-and-forget setter forwards the raw value
      // to the host (ADR 0003 / RFC-0005): assign a plain number, not a Promise. The cast bridges the
      // getter-shaped property type to the setter's real (raw-value) expectation.
      layer.opacity = target as unknown as Promise<number>;
      // Fire-and-forget setter with read-your-writes: a subsequent read must reflect the new value.
      const updated = await layer.opacity;
      assert.equal(Math.round(updated), target, "layer.opacity read-your-writes should reflect the queued set.");

      // Restore.
      layer.opacity = originalOpacity as unknown as Promise<number>;
      await layer.opacity;

      return { originalName, originalOpacity, updated };
    }
  },
  {
    name: "photoshop.layer-bounds-value",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const bounds = await layer.bounds;
      assert.ok(typeof bounds === "object" && bounds !== null, "layer.bounds should be a plain object.");
      for (const field of SIX_BOUNDS_FIELDS) {
        assert.ok(typeof bounds[field] === "number", `layer.bounds.${field} should be a number.`);
      }
      // A value object carries no remote methods.
      assert.equal(typeof (bounds as { dispose?: unknown }).dispose, "undefined", "bounds should have no dispose().");
      assert.equal(typeof (bounds as { toRemoteReference?: unknown }).toRemoteReference, "undefined", "bounds has no reference.");

      return { bounds };
    }
  },
  {
    name: "photoshop.layers-collection",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const layers = await document.layers;
      assert.ok(typeof layers.length === "number", "layers.length should be a number.");
      assert.ok(layers.length >= 1, "an open document should have at least one layer.");

      const first = layers[0];
      if (!first) {
        return skip("the active document reported no layers.");
      }

      // Element identity is stable across index/iteration.
      let iteratedFirst: unknown;
      for (const entry of layers) {
        iteratedFirst = entry;
        break;
      }
      assert.equal(iteratedFirst, first, "iteration should yield the same === layer instance as indexing.");

      // Container identity is NOT stable: re-reading the property yields a fresh collection wrapper.
      const layersAgain = await document.layers;
      assert.ok(layersAgain !== layers, "re-reading document.layers should yield a new collection wrapper.");
      // ...but the elements it resolves are the same === instances.
      assert.equal(layersAgain[0], first, "elements across collection snapshots should be === stable.");

      const byName = await layers.getByName(await first.name);
      assert.ok(byName === null || typeof byName === "object", "getByName should return a layer or null.");

      return { length: layers.length };
    }
  },
  {
    name: "photoshop.identity-dedup",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const first = await getActiveDocument(bridge, skip);
      if (isSkip(first)) {
        return first;
      }
      const second = await bridge.photoshop.app.activeDocument;

      assert.equal(second, first, "resolving the same document id twice should yield === instances.");

      const layersA = await first.layers;
      const layerA = layersA[0];
      if (layerA) {
        const layerB = (await second.layers)[0];
        assert.equal(layerB, layerA, "the same layer id should resolve to === layer instances.");
      }

      return { deduped: true };
    }
  },
  {
    name: "photoshop.layer-mutating",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      let created: PsLayer | undefined;
      let duplicated: PsLayer | undefined;
      try {
        created = (await document.createLayer({ name: `uxp-bridge-cdp-${Date.now()}` })) ?? undefined;
        assert.ok(typeof created === "object" && created !== null, "createLayer should return a layer proxy.");
        if (!created) throw new Error("createLayer returned null.");
        const createdId = await created.id;
        assert.ok(typeof createdId === "number", "created layer should expose a numeric id.");

        duplicated = (await created.duplicate()) ?? undefined;
        assert.ok(typeof duplicated === "object" && duplicated !== null, "duplicate should return a layer proxy.");
        if (!duplicated) throw new Error("duplicate returned null.");
        const duplicatedId = await duplicated.id;
        assert.ok(duplicatedId !== createdId, "duplicate should produce a distinct layer id.");

        return { createdId, duplicatedId };
      } finally {
        await deleteQuietly(duplicated);
        await deleteQuietly(created);
      }
    }
  },
  {
    name: "photoshop.layer-unit-values",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const source = await getActiveLayer(bridge, skip);
      if (isSkip(source)) {
        return source;
      }

      let duplicate: PsLayer | undefined;
      try {
        duplicate = (await source.duplicate()) ?? undefined;
        if (!duplicate) throw new Error("duplicate returned null.");
        const pixelOffset: PixelValue = { _unit: "pixelsUnit", _value: 1 };
        const noPixelOffset: PixelValue = { _unit: "pixelsUnit", _value: 0 };
        const fullScale: PercentValue = { _unit: "percentUnit", _value: 100 };
        const angle: AngleValue = { _unit: "angleUnit", _value: 1 };

        await duplicate.translate(pixelOffset, noPixelOffset);
        await duplicate.scale(fullScale, fullScale);
        await duplicate.rotate(angle);

        const duplicateId = await duplicate.id;
        assert.ok(typeof duplicateId === "number", "unit-valued transforms should keep the layer accessible.");
        return {
          duplicateId,
          unitsChecked: [pixelOffset._unit, fullScale._unit, angle._unit]
        };
      } finally {
        await deleteQuietly(duplicate);
      }
    }
  },
  {
    name: "photoshop.batch-get-set",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const batch = await layer.batchGet(["id", "name", "opacity", "visible"]);
      assert.ok(typeof batch.id === "number", "batchGet should read id.");
      assert.ok(typeof batch.name === "string", "batchGet should read name.");
      assert.ok(typeof batch.opacity === "number", "batchGet should read opacity.");
      assert.ok(typeof batch.visible === "boolean", "batchGet should read visible.");

      const original = batch.opacity as number;
      const target = original >= 50 ? 30 : 80;
      layer.batchSet({ opacity: target, visible: true });
      const afterOpacity = await layer.opacity;
      assert.equal(Math.round(afterOpacity), target, "batchSet then read-your-writes should reflect the batch.");

      // Read-only property rejected at compile time (writable-only partial) AND at runtime
      // (base `batchSet` throws for non-writable keys). The `@ts-expect-error` proves the compile-time
      // guard; the try/catch proves the runtime guard without failing the case on the expected throw.
      let readOnlyRejected = false;
      try {
        // @ts-expect-error `id` is read-only and must not be assignable through batchSet.
        layer.batchSet({ id: 1 });
      } catch {
        readOnlyRejected = true;
      }
      assert.ok(readOnlyRejected, "batchSet of a read-only property should throw at runtime.");

      // Restore.
      layer.batchSet({ opacity: original });
      await layer.opacity;

      return { batchKeys: 4, target };
    }
  },
  {
    name: "photoshop.channels-collection",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const channels = await document.channels;
      assert.ok(typeof channels.length === "number", "channels.length should be a number.");
      assert.ok(channels.length >= 1, "an open document should expose at least one channel.");

      const first = channels[0];
      if (!first) {
        return skip("the active document reported no channels.");
      }

      // Re-reading the collection yields a fresh wrapper. Unlike layers, channel *members* are NOT
      // ===-deduped (no stable native id → non-deduped RemoteObject), so we assert only the wrapper
      // is distinct and that name-based lookup resolves a channel or null.
      const channelsAgain = await document.channels;
      assert.ok(channelsAgain !== channels, "re-reading document.channels should yield a new wrapper.");

      const componentChannels = await document.componentChannels;
      assert.ok(typeof componentChannels.length === "number", "componentChannels.length should be a number.");

      const byName = await channels.getByName(await first.name);
      assert.ok(byName === null || typeof byName === "object", "channels.getByName should return a channel or null.");

      return { length: channels.length, componentLength: componentChannels.length };
    }
  },
  {
    name: "photoshop.channel-read-write",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channel = await (await document.channels).add();
      try {
        const [name, visible, kind] = await Promise.all([channel.name, channel.visible, channel.kind]);
        assert.nonEmptyString(name, "channel.name");
        assert.ok(typeof visible === "boolean", "channel.visible should resolve to a boolean.");
        assert.nonEmptyString(kind, "channel.kind");

        const originalOpacity = await channel.opacity;
        assert.ok(typeof originalOpacity === "number", "channel.opacity should resolve to a number.");

        const target = originalOpacity >= 50 ? 40 : 60;
        channel.opacity = target as unknown as Promise<number>;
        const updated = await channel.opacity;
        assert.equal(Math.round(updated), target, "channel.opacity read-your-writes should reflect the queued set.");

        return { name, visible, kind, originalOpacity, updated };
      } finally {
        await channel.remove();
      }
    }
  },
  {
    name: "photoshop.channel-color-solidcolor",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channel = await (await document.channels).add();
      try {
        const color = await channel.color;
        assert.ok(typeof color === "object" && color !== null, "channel.color should be a plain object.");
        for (const model of ["rgb", "hsb", "cmyk", "lab", "gray"] as const) {
          assert.ok(typeof color[model] === "object" && color[model] !== null, `channel.color.${model} should be present.`);
        }
        assert.nonEmptyString(color.typename, "channel.color.typename");
        // A value object carries no remote methods.
        assert.equal(typeof (color as { dispose?: unknown }).dispose, "undefined", "color should have no dispose().");

        channel.color = { rgb: { red: 12, green: 34, blue: 56 } } as unknown as Promise<typeof color>;
        const afterWrite = await channel.color;
        assert.ok(typeof afterWrite === "object" && afterWrite !== null, "channel.color read-back should be an object.");
        assert.ok(typeof afterWrite.rgb.red === "number", "channel.color.rgb.red should be a number after write.");

        channel.visible = true as unknown as Promise<boolean>;
        await channel.visible;
        const histogram = await channel.histogram;
        assert.ok(Array.isArray(histogram), "channel.histogram should be an array.");

        return { typename: color.typename, histogramLength: histogram.length };
      } finally {
        await channel.remove();
      }
    }
  },
  {
    name: "photoshop.channel-parent-document-identity",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channels = await document.channels;
      const channel = channels[0];
      if (!channel) {
        return skip("the active document reported no channels.");
      }

      // The channel's parent must resolve to the SAME === document instance (Document IS deduped by
      // native id — only channels themselves are non-deduped). This is the identity guarantee we keep.
      const parent = await channel.parent;
      assert.equal(parent, document, "channel.parent should resolve to the === owning document instance.");

      return { parentIsOwner: true };
    }
  },
  {
    name: "photoshop.selection",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) {
        return source;
      }

      let document: PsDocument | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-selection-${Date.now()}`);
        const selection = await document.selection;
        const selectionAgain = await document.selection;
        assert.equal(selectionAgain, selection, "a document's Selection proxy should be === stable.");
        assert.equal(await selection.parent, document, "selection.parent should resolve to its === owner document.");
        assert.equal(await selection.typename, "Selection", "selection.typename should be Selection.");
        assert.equal(await selection.docId, await document.id, "selection.docId should match its document id.");

        await selection.selectRectangle({ top: 1, left: 1, bottom: 8, right: 8 });
        const bounds = await selection.bounds;
        assert.ok(bounds !== null, "selectRectangle should create non-null selection bounds.");
        if (bounds === null) {
          throw new Error("selectRectangle returned null bounds.");
        }
        for (const field of SIX_BOUNDS_FIELDS) {
          assert.ok(typeof bounds[field] === "number", `selection.bounds.${field} should be a number.`);
        }
        assert.equal(typeof await selection.solid, "boolean", "selection.solid should resolve to a boolean.");

        await selection.translateBoundary(1, 1);
        await selection.deselect();
        assert.equal(await selection.bounds, null, "deselect should make selection.bounds null.");

        return { stableIdentity: true, nullableBounds: true };
      } finally {
        await closeDocumentQuietly(document);
      }
    }
  },
  {
    name: "photoshop.history-states",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) {
        return source;
      }

      let document: PsDocument | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-history-${Date.now()}`);
        const states = await document.historyStates;
        assert.ok(states.length >= 1, "a duplicated document should expose at least one history state.");
        assert.equal(states.parent, document, "historyStates.parent should be the === owner document.");

        const active = await document.activeHistoryState;
        const activeAgain = await document.activeHistoryState;
        assert.equal(activeAgain, active, "activeHistoryState should preserve === identity.");
        assert.equal(await active.parent, document, "historyState.parent should resolve to its === owner document.");
        assert.equal(await active.typename, "HistoryState", "historyState.typename should be HistoryState.");
        assert.equal(await active.docId, await document.id, "historyState.docId should match its document id.");

        const name = await active.name;
        const byName = await states.getByName(name);
        assert.equal(byName, active, "historyStates.getByName should resolve the cached active state.");

        document.activeHistoryState = active;
        assert.equal(await document.activeHistoryState, active, "activeHistoryState write should flush before a later read.");

        return { length: states.length, activeName: name, stableIdentity: true };
      } finally {
        await closeDocumentQuietly(document);
      }
    }
  },
  {
    name: "photoshop.guides",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured(); const source = await getActiveDocument(bridge, skip); if (isSkip(source)) return source;
      let document: PsDocument | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-guides-${Date.now()}`);
        const guides = await document.guides; assert.equal(guides.parent, document, "guides.parent should be the owner document.");
        const guide = await guides.add(bridge.photoshop.Direction.VERTICAL, 12);
        assert.equal(await guide.parent, document, "guide.parent should preserve document identity.");
        assert.equal(await guide.direction, bridge.photoshop.Direction.VERTICAL, "guide direction should round-trip.");
        guide.coordinate = 24 as unknown as Promise<number>; assert.equal(Math.round(await guide.coordinate), 24, "guide coordinate writes should flush before reads.");
        await guide.delete(); assert.equal((await document.guides).length, guides.length, "deleting the added guide should restore the prior count.");
        return { priorLength: guides.length, writeRead: true };
      } finally { await closeDocumentQuietly(document); }
    }
  },
  {
    name: "photoshop.path-items",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured(); const source = await getActiveDocument(bridge, skip); if (isSkip(source)) return source;
      let document: PsDocument | undefined; let path: PsPathItem | undefined; let duplicate: PsPathItem | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-paths-${Date.now()}`); const paths = await document.pathItems;
        assert.equal(paths.parent, document, "pathItems.parent should be the owner document.");
        const pathName = `Bridge Path ${Date.now()}`;
        const PathPointInfo = bridge.photoshop.PathPointInfo;
        const SubPathInfo = bridge.photoshop.SubPathInfo;
        const firstPoint = new PathPointInfo({
          anchor: [10, 10], leftDirection: [10, 10], rightDirection: [10, 10],
          kind: bridge.photoshop.PointKind.CORNERPOINT
        });
        const secondPoint = new PathPointInfo({
          anchor: [30, 30], leftDirection: [30, 30], rightDirection: [30, 30],
          kind: bridge.photoshop.PointKind.CORNERPOINT
        });
        assert.equal(firstPoint.typename, "PathPointInfo", "PathPointInfo should be constructible in the WebView.");
        const subPathInput = new SubPathInfo({
          closed: false,
          operation: bridge.photoshop.ShapeOperation.SHAPEADD,
          entireSubPath: [firstPoint, secondPoint]
        });
        assert.equal(subPathInput.typename, "SubPathInfo", "SubPathInfo should be constructible in the WebView.");
        path = await paths.add(pathName, [subPathInput]);
        assert.equal(await path.parent, document, "path.parent should preserve document identity.");
        const subPaths = await path.subPathItems; assert.equal(subPaths.parent, path, "subPathItems.parent should be the path."); assert.equal(subPaths.length, 1, "created path should have one subpath.");
        const subPath = subPaths[0]!; const points = await subPath.pathPoints; assert.equal(points.parent, subPath, "pathPoints.parent should be the subpath."); assert.equal(points.length, 2, "created subpath should have two points.");
        const anchor = await points[0]!.anchor; assert.equal(anchor[0], 10, "path point x should round-trip."); assert.equal(anchor[1], 10, "path point y should round-trip."); assert.equal(await points[0]!.parent, subPath, "pathPoint.parent should preserve identity.");
        const byName = await (await document.pathItems).getByName(pathName); assert.equal(byName, path, "getByName should resolve the stable path proxy.");
        path.name = "Bridge Path Renamed" as unknown as Promise<string>; assert.equal(await path.name, "Bridge Path Renamed", "path name writes should flush.");
        duplicate = await path.duplicate("Bridge Path Copy"); await duplicate.select(); await duplicate.deselect();
        return { subPaths: subPaths.length, points: points.length, stableIdentity: true };
      } finally { try { await duplicate?.remove(); } catch {} try { await path?.remove(); } catch {} await closeDocumentQuietly(document); }
    }
  },
  {
    name: "photoshop.text-complete-surface",
    async run({ bridge, assert, skip, reportDiagnostics }) {
      bridge.ensureConfigured();
      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) return source;

      let document: PsDocument | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-text-${Date.now()}`);
        const layer = await document.createTextLayer({ name: `Bridge Text ${Date.now()}` });
        if (!layer) return skip("Photoshop did not create the disposable text layer.");

        const text = await layer.textItem;
        assert.equal(await layer.textItem, text, "re-reading Layer.textItem should preserve identity.");
        assert.equal(await text.parent, layer, "TextItem.parent should preserve Layer identity.");
        for (const member of COMPLETE_TEXT_ITEM_MEMBERS) {
          assert.ok(member in text, `photoshop.TextItem.${member} must exist.`);
        }

        const contents = `UXP bridge ${Date.now()}`;
        text.contents = contents;
        assert.equal(await text.contents, contents, "TextItem.contents should flush before a later read.");

        const character = await text.characterStyle;
        const paragraph = await text.paragraphStyle;
        const warp = await text.warpStyle;
        assert.equal(await text.characterStyle, character, "CharacterStyle identity should be stable.");
        assert.equal(await text.paragraphStyle, paragraph, "ParagraphStyle identity should be stable.");
        assert.equal(await text.warpStyle, warp, "TextWarpStyle identity should be stable.");
        for (const member of COMPLETE_CHARACTER_STYLE_MEMBERS) {
          assert.ok(member in character, `photoshop.CharacterStyle.${member} must exist.`);
        }
        for (const member of COMPLETE_PARAGRAPH_STYLE_MEMBERS) {
          assert.ok(member in paragraph, `photoshop.ParagraphStyle.${member} must exist.`);
        }
        for (const member of COMPLETE_WARP_STYLE_MEMBERS) {
          assert.ok(member in warp, `photoshop.TextWarpStyle.${member} must exist.`);
        }

        const size = await character.size;
        character.size = size;
        assert.equal(await character.size, size, "CharacterStyle.size should flush before a later read.");
        const leftIndent = await paragraph.leftIndent;
        paragraph.leftIndent = leftIndent;
        assert.equal(await paragraph.leftIndent, leftIndent, "ParagraphStyle.leftIndent should flush before a later read.");
        const bend = await warp.bend;
        warp.bend = bend;
        assert.equal(await warp.bend, bend, "TextWarpStyle.bend should flush before a later read.");

        let conversionSupported = false;
        try {
          const paragraphText = await text.convertToParagraphText();
          assert.equal(paragraphText, text, "text conversion should preserve the TextItem proxy identity.");
          assert.equal(await text.isParagraphText, true, "convertToParagraphText should update the native text kind.");
          const pointText = await text.convertToPointText();
          assert.equal(pointText, text, "point conversion should preserve the TextItem proxy identity.");
          conversionSupported = true;
        } catch (error) {
          reportDiagnostics({ textConversionUnsupported: normalizeError(error) });
        }

        return {
          textMembers: COMPLETE_TEXT_ITEM_MEMBERS.length,
          characterMembers: COMPLETE_CHARACTER_STYLE_MEMBERS.length,
          paragraphMembers: COMPLETE_PARAGRAPH_STYLE_MEMBERS.length,
          warpMembers: COMPLETE_WARP_STYLE_MEMBERS.length,
          conversionSupported
        };
      } finally {
        await closeDocumentQuietly(document);
      }
    }
  },
  {
    name: "photoshop.layer-complete-surface",
    async run({ bridge, assert, skip, reportDiagnostics }) {
      bridge.ensureConfigured();
      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) return source;

      let document: PsDocument | undefined;
      try {
        document = await source.duplicate(`uxp-bridge-layer-${Date.now()}`);
        const group = await document.createLayerGroup({ name: `Bridge Group ${Date.now()}` });
        if (!group) return skip("Photoshop did not create the disposable layer group.");
        assert.equal(COMPLETE_LAYER_MEMBERS.length, 83, "the live Layer manifest should contain 83 documented members.");
        for (const member of COMPLETE_LAYER_MEMBERS) {
          assert.ok(member in group, `photoshop.Layer.${member} must exist.`);
        }
        assert.equal(await group.typename, "Layer", "Layer.typename should resolve to Layer.");

        const nested = await group.layers;
        assert.ok(nested !== null, "a group layer should expose a nested Layers collection.");
        assert.equal(nested?.typename, "Layers", "group.layers should decode to Layers.");
        const childName = `Bridge Child ${Date.now()}`;
        const child = await nested!.add({ name: childName });
        assert.equal(await nested!.getByName(childName), child, "group Layers.getByName should preserve child identity.");
        assert.equal(await child.parent, group, "a group-created child should preserve its parent Layer identity.");
        assert.equal(await child.layers, null, "a non-group layer should expose null for layers.");
        await child.bringToFront();
        await child.sendToBack();
        await child.translate(0, 0);

        let filterSupported = false;
        try {
          await child.applyGaussianBlur(0.1);
          filterSupported = true;
        } catch (error) {
          reportDiagnostics({ emptyPixelLayerFilterUnsupported: normalizeError(error) });
        }

        return {
          documentedMembers: COMPLETE_LAYER_MEMBERS.length,
          nestedLayers: nested!.length,
          groupIdentity: true,
          filterSupported
        };
      } finally {
        await closeDocumentQuietly(document);
      }
    }
  },
  {
    name: "photoshop.layer-core-methods",
    timeoutMs: 90_000,
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      const photoshop = bridge.photoshop;
      let document: PsDocument | null | undefined;
      try {
        document = await photoshop.app.createDocument({
          name: `uxp-bridge-layer-core-${Date.now()}`,
          width: 48,
          height: 40,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE
        });
        if (!document) return skip("Photoshop could not create the disposable layer-method document.");
        const source = (await document.layers)[0];
        if (!source) return skip("The disposable document has no source layer.");

        const first = await source.duplicate();
        const second = await source.duplicate();
        if (!first || !second) throw new Error("Layer.duplicate returned null for a disposable pixel layer.");
        await first.link(second);
        assert.ok((await first.linkedLayers).length >= 1, "Layer.link should create at least one linked relationship.");
        await first.unlink();
        assert.equal((await first.linkedLayers).length, 0, "Layer.unlink should remove linked relationships.");

        await first.move(second, photoshop.ElementPlacement.PLACEBEFORE);
        await first.bringToFront();
        await first.sendToBack();
        await first.translate(1, 1);
        await first.flip(photoshop.FlipAxis.HORIZONTAL);
        await first.scale(95, 95, photoshop.AnchorPosition.MIDDLECENTER);
        await first.rotate(2, photoshop.AnchorPosition.MIDDLECENTER);
        await first.skew(1, 0);

        const clearTarget = await source.duplicate();
        if (!clearTarget) throw new Error("Layer.duplicate returned null for the clear test.");
        const selection = await document.selection;
        await selection.selectAll();
        await clearTarget.clear();
        await selection.deselect();

        const textLayer = await document.createTextLayer({ name: `Rasterize ${Date.now()}` });
        if (!textLayer) throw new Error("Document.createTextLayer returned null for rasterize.");
        const textItem = await textLayer.textItem;
        textItem.contents = "bridge rasterize";
        await textItem.contents;
        await textLayer.rasterize(photoshop.RasterizeType.ENTIRELAYER);
        assert.equal(await textLayer.kind, photoshop.LayerKind.NORMAL, "rasterize(ENTIRELAYER) should produce a pixel layer.");

        const mergeBottom = await source.duplicate();
        const mergeTop = await source.duplicate();
        if (!mergeBottom || !mergeTop) throw new Error("Layer.duplicate returned null for merge.");
        await mergeTop.bringToFront();
        const merged = await mergeTop.merge();
        assert.equal(await merged.typename, "Layer", "Layer.merge should return a live Layer proxy.");

        const deleted = await source.duplicate();
        if (!deleted) throw new Error("Layer.duplicate returned null for delete.");
        await deleted.delete();

        return {
          methods: [
            "delete", "duplicate", "link", "unlink", "move", "translate", "flip", "scale", "rotate", "skew",
            "bringToFront", "sendToBack", "clear", "merge", "rasterize"
          ]
        };
      } finally {
        await closeDocumentQuietly(document ?? undefined);
      }
    }
  },
  {
    name: "photoshop.layer-filter-methods",
    timeoutMs: 180_000,
    async run({ bridge, assert, skip, reportDiagnostics }) {
      bridge.ensureConfigured();
      const photoshop = bridge.photoshop;
      let document: PsDocument | null | undefined;
      let displacementFile: UxpStorageFile | undefined;
      try {
        document = await photoshop.app.createDocument({
          name: `uxp-bridge-layer-filters-${Date.now()}`,
          width: 32,
          height: 32,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE,
          depth: 8
        });
        if (!document) return skip("Photoshop could not create the disposable filter document.");
        const source = (await document.layers)[0];
        if (!source) return skip("The disposable filter document has no source layer.");
        const folder = await bridge.uxp.storage.localFileSystem.getTemporaryFolder();
        const mapFile = await folder.createFile(`uxp-bridge-displacement-${Date.now()}.psd`, { overwrite: true });
        displacementFile = mapFile;
        await document.saveAs.psd(mapFile, { layers: false }, true);

        const identityMatrix = [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 1, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0
        ];
        const probes: ReadonlyArray<readonly [string, (layer: PsLayer) => Promise<void>]> = [
          ["applyAddNoise", (layer) => layer.applyAddNoise(0.1, photoshop.NoiseDistribution.UNIFORM, true)],
          ["applyAverage", (layer) => layer.applyAverage()],
          ["applyBlur", (layer) => layer.applyBlur()],
          ["applyBlurMore", (layer) => layer.applyBlurMore()],
          ["applyClouds", (layer) => layer.applyClouds()],
          ["applyCustomFilter", (layer) => layer.applyCustomFilter(identityMatrix, 1, 0)],
          ["applyDeInterlace", (layer) => layer.applyDeInterlace(photoshop.EliminateFields.EVENFIELDS, photoshop.CreateFields.DUPLICATION)],
          ["applyDespeckle", (layer) => layer.applyDespeckle()],
          ["applyDifferenceClouds", (layer) => layer.applyDifferenceClouds()],
          ["applyDiffuseGlow", (layer) => layer.applyDiffuseGlow(0, 0, 20)],
          ["applyDisplace", (layer) => layer.applyDisplace(
            1,
            1,
            photoshop.DisplacementMapType.STRETCHTOFIT,
            photoshop.UndefinedAreas.WRAPAROUND,
            mapFile
          )],
          ["applyDustAndScratches", (layer) => layer.applyDustAndScratches(1, 0)],
          ["applyGaussianBlur", (layer) => layer.applyGaussianBlur(0.1)],
          ["applyGlassEffect", (layer) => layer.applyGlassEffect(1, 1, 100, false, photoshop.TextureType.CANVAS)],
          ["applyHighPass", (layer) => layer.applyHighPass(0.1)],
          ["applyLensBlur", (layer) => layer.applyLensBlur(photoshop.DepthMapSource.NONE, 0, false, photoshop.Geometry.HEXAGON, 1)],
          ["applyLensFlare", (layer) => layer.applyLensFlare(10, { x: 16, y: 16 }, photoshop.LensType.ZOOMLENS)],
          ["applyMaximum", (layer) => layer.applyMaximum(1, photoshop.PreserveShape.SQUARENESS)],
          ["applyMinimum", (layer) => layer.applyMinimum(1, photoshop.PreserveShape.SQUARENESS)],
          ["applyMedianNoise", (layer) => layer.applyMedianNoise(1)],
          ["applyMotionBlur", (layer) => layer.applyMotionBlur(0, 1)],
          ["applyNTSC", (layer) => layer.applyNTSC()],
          ["applyOceanRipple", (layer) => layer.applyOceanRipple(1, 1)],
          ["applyOffset", (layer) => layer.applyOffset(1, 1, photoshop.OffsetUndefinedAreas.WRAPAROUND)],
          ["applyTwirl", (layer) => layer.applyTwirl(1)],
          ["applyPinch", (layer) => layer.applyPinch(1)],
          ["applyPolarCoordinates", (layer) => layer.applyPolarCoordinates(photoshop.PolarConversionType.RECTANGULARTOPOLAR)],
          ["applyRipple", (layer) => layer.applyRipple(1, photoshop.RippleSize.SMALL)],
          ["applySharpen", (layer) => layer.applySharpen()],
          ["applySharpenEdges", (layer) => layer.applySharpenEdges()],
          ["applySharpenMore", (layer) => layer.applySharpenMore()],
          ["applyShear", (layer) => layer.applyShear([{ x: 0, y: 0 }, { x: 0, y: 255 }], photoshop.UndefinedAreas.WRAPAROUND)],
          ["applySmartBlur", (layer) => layer.applySmartBlur(1, 1, photoshop.SmartBlurQuality.HIGH, photoshop.SmartBlurMode.NORMAL)],
          ["applySpherize", (layer) => layer.applySpherize(1, photoshop.SpherizeMode.NORMAL)],
          ["applyUnSharpMask", (layer) => layer.applyUnSharpMask(1, 0.1, 0)],
          ["applyWave", (layer) => layer.applyWave(1, 1, 2, 1, 2, 100, 100, photoshop.WaveType.SINE, photoshop.UndefinedAreas.WRAPAROUND, 1)],
          ["applyZigZag", (layer) => layer.applyZigZag(1, 1, photoshop.ZigZagType.AROUNDCENTER)],
          ["applyImage", (layer) => layer.applyImage({
            source: { document: document!, layer: source, channel: photoshop.ApplyImageChannel.RGB },
            blending: photoshop.ApplyImageBlendMode.NORMAL,
            opacity: 100
          })]
        ];
        const passed: string[] = [];
        const failures: Record<string, Record<string, unknown>> = {};
        for (const [name, invoke] of probes) {
          let target: PsLayer | null | undefined;
          try {
            target = await source.duplicate();
            if (!target) throw new Error("source.duplicate returned null");
            await invoke(target);
            passed.push(name);
          } catch (error) {
            failures[name] = normalizeError(error);
          } finally {
            await deleteQuietly(target ?? undefined);
          }
        }
        reportDiagnostics({ layerFilterPassed: passed, layerFilterFailures: failures });
        assert.equal(
          Object.keys(failures).length,
          0,
          `Layer filter methods failed: ${Object.entries(failures).map(([name, error]) => `${name}: ${error.message}`).join("; ")}`
        );
        return { methods: passed, tested: probes.length };
      } finally {
        await closeDocumentQuietly(document ?? undefined);
        if (displacementFile) {
          try { await displacementFile.delete(); } catch {}
          try { await displacementFile.dispose(); } catch {}
        }
      }
    }
  },
  {
    name: "photoshop.document-complete-surface",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) {
        return source;
      }

      const documentedMembers = [
        "saveAs", "selection", "activeChannels", "activeHistoryBrushSource", "activeHistoryState", "activeLayers",
        "artboards", "backgroundLayer", "bitsPerChannel", "channels", "cloudDocument", "cloudWorkAreaDirectory",
        "colorProfileName", "colorProfileType", "colorSamplers", "componentChannels", "compositeChannels", "countItems",
        "guides", "height", "histogram", "historyStates", "id", "layerComps", "layers", "mode", "name", "path",
        "pathItems", "pixelAspectRatio", "quickMaskMode", "resolution", "saved", "title", "typename", "width", "zoom",
        "calculations", "changeMode", "close", "closeWithoutSaving", "convertProfile", "createLayer", "createLayerGroup",
        "createPixelLayer", "createTextLayer", "crop", "duplicate", "duplicateLayers", "flatten", "generativeUpscale",
        "groupLayers", "linkLayers", "mergeVisibleLayers", "paste", "rasterizeAllLayers", "resizeCanvas", "resizeImage",
        "revealAll", "rotate", "sampleColor", "save", "splitChannels", "trap", "trim"
      ];
      assert.equal(documentedMembers.length, 65, "the transportable Document manifest should contain 65 members.");
      for (const member of documentedMembers) {
        assert.ok(member in source, `photoshop.Document.${member} must exist.`);
      }
      assert.equal("suspendHistory" in source, false, "suspendHistory must remain absent until callback transport exists.");

      const scalars = await source.batchGet([
        "typename", "histogram", "mode", "zoom", "bitsPerChannel", "colorProfileName", "colorProfileType"
      ]);
      assert.equal(scalars.typename, "Document", "document.typename should be Document.");
      assert.ok(Array.isArray(scalars.histogram), "document.histogram should be an array.");
      assert.nonEmptyString(scalars.mode, "document.mode");
      assert.ok(typeof scalars.zoom === "number", "document.zoom should be a number.");
      assert.nonEmptyString(scalars.bitsPerChannel, "document.bitsPerChannel");
      assert.ok(typeof scalars.colorProfileName === "string", "document.colorProfileName should be a string.");
      assert.nonEmptyString(scalars.colorProfileType, "document.colorProfileType");

      const readCollection = async <T>(name: string, read: Promise<T>): Promise<T> => {
        try {
          return await read;
        } catch (error) {
          throw new Error(`document.${name} failed: ${normalizeError(error).message}`);
        }
      };
      const channels = await readCollection("compositeChannels", source.compositeChannels);
      const samplers = await readCollection("colorSamplers", source.colorSamplers);
      const layerComps = await readCollection("layerComps", source.layerComps);
      assert.equal(channels.parent, source, "compositeChannels.parent should preserve document identity.");
      assert.equal(samplers.parent, source, "colorSamplers.parent should preserve document identity.");
      assert.equal(layerComps.parent, source, "layerComps.parent should preserve document identity.");
      assert.equal(layerComps.typename, "LayerComps", "layerComps.typename should be LayerComps.");
      assert.functions(samplers, ["add", "removeAll"], "document.colorSamplers");
      assert.functions(layerComps, ["add", "getAllByName", "removeAll"], "document.layerComps");

      const sampled = await source.sampleColor({ x: 0, y: 0 });
      assert.ok(sampled.typename === "SolidColor" || sampled.typename === "NoColor", "sampleColor should decode its color union.");

      return {
        documentedMembers: documentedMembers.length,
        samplers: samplers.length,
        layerComps: layerComps.length
      };
    }
  },
  {
    name: "photoshop.count-items",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const source = await getActiveDocument(bridge, skip);
      if (isSkip(source)) {
        return source;
      }

      let countItems;
      try {
        countItems = await source.countItems;
      } catch (error) {
        return skip("this Photoshop runtime cannot construct CountItems for the active document.", {
          error: normalizeError(error)
        });
      }
      assert.equal(countItems.parent, source, "countItems.parent should preserve document identity.");
      assert.equal(countItems.typename, "CountItems", "countItems.typename should be CountItems.");
      assert.functions(
        countItems,
        ["add", "removeAllFromActiveGroup", "getAll", "createGroup", "renameActiveGroup", "removeGroupByIndex",
          "toggleActiveGroupVisibility", "activateGroupByIndex", "setActiveMarkerSize", "setActiveLabelSize", "setActiveColor"],
        "document.countItems"
      );
      return { length: countItems.length };
    }
  },
  {
    name: "photoshop.document-save-as",
    timeoutMs: 120_000,
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      const photoshop = bridge.photoshop;
      let document: PsDocument | null | undefined;
      let reopened: PsDocument | undefined;
      const files: Array<{
        name: string;
        delete(): Promise<number>;
        dispose(): Promise<void>;
        getMetadata(): Promise<{ size?: number }>;
      }> = [];
      try {
        document = await photoshop.app.createDocument({
          name: `uxp-bridge-save-as-${Date.now()}`,
          width: 32,
          height: 24,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE,
          depth: 8
        });
        if (!document) return skip("Photoshop could not create the disposable save fixture.");
        const folder = await bridge.uxp.storage.localFileSystem.getTemporaryFolder();
        const createOutput = async (extension: string) => {
          const output = await folder.createFile(`uxp-bridge-save-as-${Date.now()}.${extension}`, { overwrite: true });
          files.push(output);
          return output;
        };

        const bmp = await createOutput("bmp");
        await document.saveAs.bmp(bmp, { depth: photoshop.BMPDepthType.TWENTYFOUR }, true);
        const gif = await createOutput("gif");
        await document.saveAs.gif(gif, { colors: 256, transparency: true }, true);
        const jpg = await createOutput("jpg");
        await document.saveAs.jpg(jpg, { quality: 8, embedColorProfile: true }, true);
        const png = await createOutput("png");
        await document.saveAs.png(png, { method: photoshop.PNGMethod.QUICK }, true);
        const psb = await createOutput("psb");
        await document.saveAs.psb(psb, { layers: true, embedColorProfile: true }, true);
        const psd = await createOutput("psd");
        await document.saveAs.psd(psd, { layers: true, embedColorProfile: true });
        await document.save();

        const bytes: Record<string, number> = {};
        for (const file of files) {
          const metadata = await file.getMetadata();
          assert.ok(typeof metadata.size === "number" && metadata.size > 0, `${file.name} should be non-empty.`);
          bytes[file.name.slice(file.name.lastIndexOf(".") + 1)] = metadata.size as number;
        }

        await document.closeWithoutSaving();
        document = undefined;
        const opened = await photoshop.app.open(psd) as PsDocument;
        reopened = opened;
        assert.equal(await opened.typename, "Document", "app.open should return a Document proxy for the saved PSD.");
        return { formats: Object.keys(bytes), bytes, methods: ["save", "closeWithoutSaving", "open"] };
      } finally {
        await closeDocumentQuietly(reopened);
        await closeDocumentQuietly(document ?? undefined);
        for (const file of files) {
          try { await file.delete(); } catch {}
          try { await file.dispose(); } catch {}
        }
      }
    }
  },
  {
    name: "photoshop.document-core-methods",
    timeoutMs: 180_000,
    async run({ bridge, assert, skip, reportDiagnostics }) {
      bridge.ensureConfigured();
      const photoshop = bridge.photoshop;
      let document: PsDocument | null | undefined;
      let closedDocument: PsDocument | null | undefined;
      const extraDocuments: PsDocument[] = [];
      try {
        document = await photoshop.app.createDocument({
          name: `uxp-bridge-document-core-${Date.now()}`,
          width: 64,
          height: 48,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE,
          depth: 8
        });
        if (!document) return skip("Photoshop could not create the disposable document-method fixture.");

        closedDocument = await photoshop.app.createDocument({
          name: `uxp-bridge-document-close-${Date.now()}`,
          width: 8,
          height: 8,
          fill: photoshop.DocumentFill.TRANSPARENT
        });
        if (!closedDocument) throw new Error("Could not create the Document.close fixture.");
        await closedDocument.close(photoshop.SaveOptions.DONOTSAVECHANGES);
        closedDocument = undefined;

        const generic = await document.createLayer({ name: `Generic ${Date.now()}` });
        const pixel = await document.createPixelLayer({ name: `Pixel ${Date.now()}` });
        const text = await document.createTextLayer({ name: `Text ${Date.now()}` });
        const group = await document.createLayerGroup({ name: `Group ${Date.now()}` });
        assert.ok(generic && pixel && text && group, "all four Document layer factory methods should return layers.");
        if (!generic || !pixel || !text || !group) throw new Error("A Document layer factory returned null.");

        const groupA = await document.createPixelLayer({ name: `Group A ${Date.now()}` });
        const groupB = await document.createPixelLayer({ name: `Group B ${Date.now()}` });
        if (!groupA || !groupB) throw new Error("Could not create groupLayers inputs.");
        const grouped = await document.groupLayers([groupA, groupB]);
        assert.ok(grouped !== null, "Document.groupLayers should return the created group.");

        const linkA = await document.createPixelLayer({ name: `Link A ${Date.now()}` });
        const linkB = await document.createPixelLayer({ name: `Link B ${Date.now()}` });
        if (!linkA || !linkB) throw new Error("Could not create linkLayers inputs.");
        const linked = await document.linkLayers([linkA, linkB]);
        assert.ok(linked.length >= 1, "Document.linkLayers should return linked peers.");
        assert.ok((await linkA.linkedLayers).length >= 1, "Document.linkLayers should establish the relationship on its inputs.");
        const duplicatedLayers = await document.duplicateLayers([linkA, linkB]);
        assert.ok(duplicatedLayers.length >= 2, "Document.duplicateLayers should return duplicated layers.");

        await document.resizeCanvas(72, 56, photoshop.AnchorPosition.MIDDLECENTER);
        assert.equal(Math.round(await document.width), 72, "resizeCanvas should update document width.");
        await document.resizeImage(36, 28, 72, photoshop.ResampleMethod.BICUBIC);
        assert.equal(Math.round(await document.width), 36, "resizeImage should update document width.");
        await document.rotate(90);
        const rotatedWidth = await document.width;
        const rotatedHeight = await document.height;
        await document.crop({
          left: 1,
          top: 1,
          right: rotatedWidth - 1,
          bottom: rotatedHeight - 1,
          width: rotatedWidth - 2,
          height: rotatedHeight - 2
        });
        await document.revealAll();
        const sampled = await document.sampleColor({ x: 0, y: 0 });
        assert.ok(sampled.typename === "SolidColor" || sampled.typename === "NoColor", "sampleColor should return a color union.");

        const flattened = await document.duplicate(`uxp-bridge-flatten-${Date.now()}`);
        extraDocuments.push(flattened);
        await flattened.flatten();
        assert.equal((await flattened.layers).length, 1, "Document.flatten should leave one layer.");

        const merged = await document.duplicate(`uxp-bridge-merge-visible-${Date.now()}`);
        extraDocuments.push(merged);
        await merged.mergeVisibleLayers();
        assert.ok((await merged.layers).length >= 1, "mergeVisibleLayers should leave a live layer collection.");

        const rasterized = await document.duplicate(`uxp-bridge-rasterize-all-${Date.now()}`);
        extraDocuments.push(rasterized);
        await rasterized.rasterizeAllLayers();

        const grayscale = await document.duplicate(`uxp-bridge-grayscale-${Date.now()}`);
        extraDocuments.push(grayscale);
        await grayscale.changeMode(photoshop.ChangeMode.GRAYSCALE);
        assert.equal(await grayscale.mode, photoshop.DocumentMode.GRAYSCALE, "changeMode should update Document.mode.");

        const profiles = await photoshop.app.getColorProfiles("RGB");
        let convertedProfile: string | undefined;
        if (profiles[0]) {
          const profiled = await document.duplicate(`uxp-bridge-profile-${Date.now()}`);
          extraDocuments.push(profiled);
          await profiled.convertProfile(profiles[0], photoshop.Intent.RELATIVECOLORIMETRIC, true, false);
          convertedProfile = profiles[0];
        }

        const calculationDocument = await photoshop.app.createDocument({
          name: `uxp-bridge-calculations-${Date.now()}`,
          width: 24,
          height: 24,
          resolution: 72,
          mode: photoshop.NewDocumentMode.RGB,
          fill: photoshop.DocumentFill.WHITE,
          depth: 8
        });
        if (!calculationDocument) throw new Error("Could not create the Document.calculations fixture.");
        extraDocuments.push(calculationDocument);
        photoshop.app.activeDocument = calculationDocument;
        await photoshop.app.activeDocument;
        const calculationLayers = await calculationDocument.layers;
        const calculationChannels = await calculationDocument.componentChannels;
        const calculationLayer = calculationLayers[0];
        const calculationChannel = calculationChannels[0];
        if (!calculationLayer || !calculationChannel) throw new Error("Could not resolve calculations source objects.");
        const calculation = await calculationDocument.calculations({
          source1: {
            document: calculationDocument,
            layer: calculationLayer,
            channel: calculationChannel
          },
          source2: {
            document: calculationDocument,
            layer: calculationLayer,
            channel: calculationChannel
          },
          blending: photoshop.CalculationsBlendMode.NORMAL,
          opacity: 100,
          result: photoshop.CalculationsResult.NEWCHANNEL
        });
        assert.ok(calculation && "remove" in calculation, "calculations(NEWCHANNEL) should return a Channel proxy.");
        if (calculation && "remove" in calculation) await calculation.remove();

        const trimDocument = await photoshop.app.createDocument({
          name: `uxp-bridge-trim-${Date.now()}`,
          width: 20,
          height: 20,
          fill: photoshop.DocumentFill.WHITE
        });
        if (!trimDocument) throw new Error("Could not create the Document.trim fixture.");
        extraDocuments.push(trimDocument);
        await trimDocument.trim(photoshop.TrimType.TOPLEFT, true, true, true, true);

        const splitSource = await document.duplicate(`uxp-bridge-split-${Date.now()}`, true);
        extraDocuments.push(splitSource);
        const splitDocuments = await splitSource.splitChannels();
        extraDocuments.push(...splitDocuments);
        assert.ok(splitDocuments.length >= 1, "splitChannels should return one or more documents.");

        const cmyk = await photoshop.app.createDocument({
          name: `uxp-bridge-trap-${Date.now()}`,
          width: 16,
          height: 16,
          mode: photoshop.NewDocumentMode.CMYK,
          fill: photoshop.DocumentFill.WHITE
        });
        if (!cmyk) throw new Error("Could not create the CMYK Document.trap fixture.");
        extraDocuments.push(cmyk);
        await cmyk.trap(1);

        reportDiagnostics({ convertedProfile, splitDocuments: splitDocuments.length });
        return {
          methods: [
            "close", "duplicate", "flatten", "mergeVisibleLayers", "revealAll", "rasterizeAllLayers", "crop",
            "resizeCanvas", "resizeImage", "trim", "rotate", "createLayer", "createPixelLayer", "createTextLayer",
            "createLayerGroup", "groupLayers", "duplicateLayers", "linkLayers", "changeMode", "convertProfile",
            "calculations", "sampleColor", "splitChannels", "trap"
          ],
          convertedProfile
        };
      } finally {
        await closeDocumentQuietly(closedDocument ?? undefined);
        for (let index = extraDocuments.length - 1; index >= 0; index -= 1) {
          await closeDocumentQuietly(extraDocuments[index]);
        }
        await closeDocumentQuietly(document ?? undefined);
      }
    }
  },
  {
    name: "photoshop.action-classes",
    timeoutMs: 90_000,
    async run({ bridge, assert, skip, reportDiagnostics }) {
      bridge.ensureConfigured();
      const actionTree = await bridge.photoshop.app.actionTree;
      const sourceSet = actionTree[0];
      if (!sourceSet) return skip("Photoshop Actions panel has no ActionSet fixture to inspect.");

      assert.equal(await sourceSet.typename, "ActionSet", "ActionSet.typename should resolve.");
      assert.ok(typeof await sourceSet.id === "number", "ActionSet.id should resolve to a number.");
      assert.ok(typeof await sourceSet.index === "number", "ActionSet.index should resolve to a number.");
      assert.nonEmptyString(await sourceSet.name, "ActionSet.name");
      const sourceActions = await sourceSet.actions;

      let duplicateSet: typeof sourceSet | undefined;
      let duplicateAction: (typeof sourceActions)[number] | undefined;
      try {
        duplicateSet = await sourceSet.duplicate();
        const setName = `UXP Bridge Set ${Date.now()}`;
        duplicateSet.name = setName;
        assert.equal(await duplicateSet.name, setName, "ActionSet.name should flush before read.");

        const actions = await duplicateSet.actions;
        const sourceAction = actions[0];
        if (!sourceAction) {
          reportDiagnostics({ actionMethodCoverage: "ActionSet duplicated; cloned set contained no Action." });
          return { actionSetMethods: ["duplicate", "delete"], actionMethods: [] };
        }
        assert.equal(await sourceAction.typename, "Action", "Action.typename should resolve.");
        assert.ok(typeof await sourceAction.id === "number", "Action.id should resolve to a number.");
        assert.ok(typeof await sourceAction.index === "number", "Action.index should resolve to a number.");
        assert.equal(await sourceAction.parent, duplicateSet, "Action.parent should preserve ActionSet identity.");

        duplicateAction = await sourceAction.duplicate();
        const actionName = `UXP Bridge Action ${Date.now()}`;
        duplicateAction.name = actionName;
        assert.equal(await duplicateAction.name, actionName, "Action.name should flush before read.");
        await duplicateAction.delete();
        duplicateAction = undefined;
        return {
          actionSetMethods: ["duplicate", "delete"],
          actionMethods: ["duplicate", "delete"],
          intentionallyNotPlayed: true
        };
      } finally {
        try { await duplicateAction?.delete(); } catch {}
        try { await duplicateSet?.delete(); } catch {}
      }
    }
  },
  {
    name: "photoshop.batchplay-roundtrip",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      // Read-style descriptor: get the target layer property set. batchPlay returns a descriptor array.
      const [layerDescriptor] = await bridge.photoshop.action.batchPlay([
        { _obj: "get", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
      ]);
      assert.ok(typeof layerDescriptor === "object" && layerDescriptor !== null, "batchPlay read should return a descriptor.");
      const nativeLayerId = layerDescriptor.layerID as number;
      assert.ok(typeof nativeLayerId === "number", "the read descriptor should carry a native layerID.");

      // The bridge proxy id must agree with the native id batchPlay reports (proves the disjoint id
      // spaces still refer to the same layer — the "caller supplies native id" workflow).
      const proxyId = await layer.id;
      assert.equal(nativeLayerId, proxyId, "batchPlay's native layerID should match the proxy layer id.");

      // Write-style descriptor: flip visibility of that layer by its native id, then restore it. This
      // proves a caller can target a specific layer with a native id obtained from the DOM proxy.
      const originalVisible = await layer.visible;
      const setVisible = (visible: boolean) =>
        bridge.photoshop.action.batchPlay([
          {
            _obj: visible ? "show" : "hide",
            _target: [{ _ref: "layer", _id: nativeLayerId }]
          }
        ]);

      const writeResult = await setVisible(!originalVisible);
      assert.ok(Array.isArray(writeResult), "batchPlay write should return a descriptor array.");
      const afterWrite = await layer.visible;
      assert.equal(afterWrite, !originalVisible, "batchPlay set should have flipped the layer visibility.");

      // Restore.
      await setVisible(originalVisible);
      const restored = await layer.visible;
      assert.equal(restored, originalVisible, "batchPlay should have restored the original visibility.");

      return { nativeLayerId, proxyId, roundTripped: true };
    }
  },
  {
    name: "photoshop.action-utilities",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const documentId = await document.id;
      const reference = [{ _ref: "document", _id: documentId }];

      const [descriptor] = await bridge.photoshop.action.batchPlaySync([
        { _obj: "get", _target: reference }
      ]);
      assert.ok(typeof descriptor === "object" && descriptor !== null, "batchPlaySync should return a descriptor.");
      assert.equal(descriptor.documentID, documentId, "batchPlaySync should read the active native document id.");

      const firstId = await bridge.photoshop.action.getIDFromString("document");
      const secondId = await bridge.photoshop.action.getIDFromString("document");
      assert.ok(typeof firstId === "number" && Number.isFinite(firstId), "getIDFromString should return a finite number.");
      assert.equal(secondId, firstId, "getIDFromString should return a stable id for the same string.");

      const valid = await bridge.photoshop.action.validateReference(reference);
      assert.equal(valid, true, "validateReference should accept the active document reference.");

      return { documentId, actionStringId: firstId, valid };
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
): Promise<PsDocument | SkipMarker> {
  try {
    const document = await bridge.photoshop.app.activeDocument;
    if (!document) {
      return markSkip(skip("photoshop.app.activeDocument is unavailable (no open document)."));
    }
    return document as PsDocument;
  } catch (error) {
    return markSkip(skip("photoshop.app.activeDocument threw; open a document to run this case.", { error: normalizeError(error) }));
  }
}

async function getActiveLayer(
  bridge: { photoshop: any },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown
): Promise<PsLayer | SkipMarker> {
  const document = await getActiveDocument(bridge, skip);
  if (isSkip(document)) {
    return document;
  }
  try {
    const layers = await document.layers;
    const layer = layers[0];
    if (!layer) {
      return markSkip(skip("the active document has no layers."));
    }
    return layer;
  } catch (error) {
    return markSkip(skip("reading document.layers threw.", { error: normalizeError(error) }));
  }
}

function markSkip(skipResult: unknown): SkipMarker {
  // The harness's `skip()` returns its own sentinel; we wrap it so callers can early-return it while
  // keeping a typed guard. The harness recognizes the original sentinel by identity, so we return it
  // as-is but brand the reference for our guard.
  (skipResult as { __skip?: boolean }).__skip = true;
  return skipResult as SkipMarker;
}

async function deleteQuietly(layer: PsLayer | undefined): Promise<void> {
  if (!layer) {
    return;
  }
  try {
    await layer.delete();
  } catch {
    // Best-effort cleanup; assertions own pass/fail.
  }
}

async function closeDocumentQuietly(document: PsDocument | undefined): Promise<void> {
  if (!document) {
    return;
  }
  try {
    await document.closeWithoutSaving();
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
