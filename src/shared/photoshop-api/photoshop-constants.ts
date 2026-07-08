/**
 * Photoshop DOM enum values, transcribed as runtime `as const` objects.
 *
 * Adobe ships these enums as type-only declarations in the ambient `photoshop` module
 * (`src/shared/types/photoshop/internal/dom/Constants.d.ts`); `.d.ts` carries no runtime values, so
 * the values must be hand-copied here for both bridge sides to import. Only the enums used by the
 * current batch are transcribed on demand. See docs/adr/0006-constants-in-shared-transcribed-on-demand.md
 * and the Photoshop UXP reference: https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/constants/
 */

/**
 * Save options passed to {@link Document.close}.
 * Source: Constants.d.ts `enum SaveOptions` (numeric-valued).
 */
export const SaveOptions = {
  DONOTSAVECHANGES: 0,
  PROMPTTOSAVECHANGES: 1,
  SAVECHANGES: 2
} as const;
export type SaveOptionsValue = (typeof SaveOptions)[keyof typeof SaveOptions];

/**
 * Anchor position for transform/resize operations (e.g. {@link Document.resizeCanvas}).
 * Source: Constants.d.ts `enum AnchorPosition`.
 */
export const AnchorPosition = {
  BOTTOMCENTER: "bottom-center",
  BOTTOMLEFT: "bottom-left",
  BOTTOMRIGHT: "bottom-right",
  MIDDLECENTER: "middle-center",
  MIDDLELEFT: "middle-left",
  MIDDLERIGHT: "middle-right",
  TOPCENTER: "top-center",
  TOPLEFT: "top-left",
  TOPRIGHT: "top-right"
} as const;
export type AnchorPositionValue = (typeof AnchorPosition)[keyof typeof AnchorPosition];

/**
 * Layer blending mode ({@link Layer.blendMode}).
 * Source: Constants.d.ts `enum BlendMode` (note SUBTRACT='blendSubtraction', DIVIDE='blendDivide').
 */
export const BlendMode = {
  NORMAL: "normal",
  DISSOLVE: "dissolve",
  DARKEN: "darken",
  MULTIPLY: "multiply",
  COLORBURN: "colorBurn",
  LINEARBURN: "linearBurn",
  DARKERCOLOR: "darkerColor",
  LIGHTEN: "lighten",
  SCREEN: "screen",
  COLORDODGE: "colorDodge",
  LINEARDODGE: "linearDodge",
  LIGHTERCOLOR: "lighterColor",
  OVERLAY: "overlay",
  SOFTLIGHT: "softLight",
  HARDLIGHT: "hardLight",
  VIVIDLIGHT: "vividLight",
  LINEARLIGHT: "linearLight",
  PINLIGHT: "pinLight",
  HARDMIX: "hardMix",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  SUBTRACT: "blendSubtraction",
  DIVIDE: "blendDivide",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
  PASSTHROUGH: "passThrough"
} as const;
export type BlendModeValue = (typeof BlendMode)[keyof typeof BlendMode];

/**
 * Kind of a layer ({@link Layer.kind}).
 * Source: Constants.d.ts `enum LayerKind` (note NORMAL='pixel', SOLIDFILL='solidColor', LAYER3D='threeD').
 */
export const LayerKind = {
  BLACKANDWHITE: "blackAndWhite",
  BRIGHTNESSCONTRAST: "brightnessContrast",
  CHANNELMIXER: "channelMixer",
  COLORBALANCE: "colorBalance",
  CURVES: "curves",
  EXPOSURE: "exposure",
  GRADIENTFILL: "gradientFill",
  GRADIENTMAP: "gradientMap",
  HUESATURATION: "hueSaturation",
  INVERSION: "inversion",
  LEVELS: "levels",
  NORMAL: "pixel",
  PATTERNFILL: "pattern",
  PHOTOFILTER: "photoFilter",
  POSTERIZE: "posterize",
  SELECTIVECOLOR: "selectiveColor",
  SMARTOBJECT: "smartObject",
  SOLIDFILL: "solidColor",
  TEXT: "text",
  THRESHOLD: "threshold",
  LAYER3D: "threeD",
  VIBRANCE: "vibrance",
  VIDEO: "video",
  GROUP: "group",
  COLORLOOKUP: "colorLookup",
  CLARITY: "clarity",
  GRAIN: "grain"
} as const;
export type LayerKindValue = (typeof LayerKind)[keyof typeof LayerKind];

/**
 * Placement mode for {@link Layer.move} / layer creation relative positioning.
 * Source: Constants.d.ts `enum ElementPlacement`.
 */
export const ElementPlacement = {
  PLACEBEFORE: "placeBefore",
  PLACEATBEGINNING: "placeAtBeginning",
  PLACEATEND: "placeAtEnd",
  PLACEAFTER: "placeAfter",
  PLACEINSIDE: "placeInside"
} as const;
export type ElementPlacementValue = (typeof ElementPlacement)[keyof typeof ElementPlacement];

/**
 * Axis for {@link Layer.flip}.
 * Source: Constants.d.ts `enum FlipAxis`.
 */
export const FlipAxis = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
  BOTH: "both"
} as const;
export type FlipAxisValue = (typeof FlipAxis)[keyof typeof FlipAxis];
