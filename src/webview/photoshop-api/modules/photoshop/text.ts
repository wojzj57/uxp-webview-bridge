import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { POINT_VALUE_KIND, SOLID_COLOR_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type {
  CharacterStyle,
  ParagraphStyle,
  PsLayer,
  PsPoint,
  PsSolidColor,
  TextItem,
  TextWarpStyle
} from "./types.js";

const CHARACTER_STYLE_PROPERTIES = [
  "font", "size", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic",
  "useAutoLeading", "leading", "tracking", "baselineShift", "horizontalDiacriticPosition",
  "verticalDiacriticPosition", "autoKerning", "capitalization", "baseline", "strikeThrough",
  "underline", "ligatures", "alternateLigatures", "fractions", "ordinals", "swash",
  "titlingAlternates", "stylisticAlternates", "language", "characterAlignment", "noBreak",
  "color", "kashidas", "middleEasternTextDirection", "middleEasternDigitsType",
  "fractionalWidths", "antiAliasMethod"
] as const;

const PARAGRAPH_STYLE_PROPERTIES = [
  "justification", "justificationFeatures", "leftIndent", "rightIndent", "firstLineIndent",
  "spaceBefore", "kashidaWidth", "kinsoku", "mojikumi", "spaceAfter", "hyphenation",
  "hyphenationFeatures", "layoutMode", "features"
] as const;

const TEXT_WARP_STYLE_PROPERTIES = [
  "style", "direction", "bend", "horizontalDistortion", "verticalDistortion"
] as const;

const TEXT_ITEM_WRITABLE = ["contents", "textClickPoint", "orientation"] as const;

export function createCharacterStyleProperties(): Record<string, RemotePropertyDescriptor> {
  return Object.fromEntries(CHARACTER_STYLE_PROPERTIES.map((name) => [name, {
    writable: true,
    mutating: true,
    remoteKey: name,
    ...(name === "color" ? { valueKind: SOLID_COLOR_VALUE_KIND } : {})
  }]));
}

export function createParagraphStyleProperties(): Record<string, RemotePropertyDescriptor> {
  return Object.fromEntries(PARAGRAPH_STYLE_PROPERTIES.map((name) => [name, {
    writable: true,
    mutating: true,
    remoteKey: name
  }]));
}

export function createTextWarpStyleProperties(): Record<string, RemotePropertyDescriptor> {
  return Object.fromEntries(TEXT_WARP_STYLE_PROPERTIES.map((name) => [name, {
    writable: true,
    mutating: true,
    remoteKey: name
  }]));
}

export function createTextItemProperties(): Record<string, RemotePropertyDescriptor> {
  const T = PHOTOSHOP_REMOTE_TYPE;
  return {
    parent: { writable: false, mutating: false, remoteKey: "parent", refType: T.Layer },
    typename: { writable: false, mutating: false, remoteKey: "typename" },
    contents: { writable: true, mutating: true, remoteKey: "contents" },
    textClickPoint: { writable: true, mutating: true, remoteKey: "textClickPoint", valueKind: POINT_VALUE_KIND },
    orientation: { writable: true, mutating: true, remoteKey: "orientation" },
    isPointText: { writable: false, mutating: false, remoteKey: "isPointText" },
    isParagraphText: { writable: false, mutating: false, remoteKey: "isParagraphText" },
    characterStyle: { writable: false, mutating: false, remoteKey: "characterStyle", refType: T.CharacterStyle },
    paragraphStyle: { writable: false, mutating: false, remoteKey: "paragraphStyle", refType: T.ParagraphStyle },
    warpStyle: { writable: false, mutating: false, remoteKey: "warpStyle", refType: T.TextWarpStyle }
  };
}

export function createTextItemMethods(): Record<string, RemoteMethodDescriptor> {
  return {
    convertToParagraphText: { mutating: true, refType: PHOTOSHOP_REMOTE_TYPE.TextItem },
    convertToPointText: { mutating: true, refType: PHOTOSHOP_REMOTE_TYPE.TextItem },
    convertToShape: { mutating: true },
    createWorkPath: { mutating: true }
  };
}

function methodNames(
  prefix: string,
  properties: Record<string, RemotePropertyDescriptor>,
  methods: Record<string, RemoteMethodDescriptor>,
  writable: readonly string[]
): RemoteMethodNames {
  return {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, `${prefix}.propertyGet`])),
    propertySet: Object.fromEntries(writable.map((name) => [name, `${prefix}.propertySet`])),
    method: Object.fromEntries(Object.keys(methods).map((name) => [name, `${prefix}.${name}`])),
    batchGet: `${prefix}.batchGet`,
    batchSet: `${prefix}.batchSet`,
    dispose: `${prefix}.dispose`
  };
}

function config(
  context: PhotoshopContext,
  prefix: string,
  properties: Record<string, RemotePropertyDescriptor>,
  methods: Record<string, RemoteMethodDescriptor>,
  writable: readonly string[]
): RemoteClassConfig {
  return {
    rpc: context.rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    properties,
    methods,
    methodNames: methodNames(prefix, properties, methods, writable),
    argEncoders: context.argEncoders,
    decodeContext: context.registry.decodeContext
  };
}

export function createCharacterStyleClass(context: PhotoshopContext): { new (reference: RemoteReference): CharacterStyle } {
  const properties = createCharacterStyleProperties();
  const classConfig = config(context, "characterStyle", properties, { reset: { mutating: true } }, CHARACTER_STYLE_PROPERTIES);
  class WebviewCharacterStyle extends RemoteClass {
    declare font: Promise<string>; declare size: Promise<number>;
    declare horizontalScale: Promise<number>; declare verticalScale: Promise<number>;
    declare fauxBold: Promise<boolean>; declare fauxItalic: Promise<boolean>;
    declare useAutoLeading: Promise<boolean>; declare leading: Promise<number>; declare tracking: Promise<number>;
    declare baselineShift: Promise<number>; declare horizontalDiacriticPosition: Promise<number>;
    declare verticalDiacriticPosition: Promise<number>; declare autoKerning: Promise<string>;
    declare capitalization: Promise<string>; declare baseline: Promise<string>; declare strikeThrough: Promise<string>;
    declare underline: Promise<string>; declare ligatures: Promise<boolean>; declare alternateLigatures: Promise<boolean>;
    declare fractions: Promise<boolean>; declare ordinals: Promise<boolean>; declare swash: Promise<boolean>;
    declare titlingAlternates: Promise<boolean>; declare stylisticAlternates: Promise<boolean>;
    declare language: Promise<string>; declare characterAlignment: Promise<string>; declare noBreak: Promise<boolean>;
    declare color: Promise<PsSolidColor>; declare kashidas: Promise<boolean>;
    declare middleEasternTextDirection: Promise<string>; declare middleEasternDigitsType: Promise<string>;
    declare fractionalWidths: Promise<boolean>; declare antiAliasMethod: Promise<string>;
    declare reset: () => Promise<void>;
    constructor(source: RemoteReference | RemoteConstructionRequest) { super(classConfig, source); }
  }
  return WebviewCharacterStyle as unknown as { new (reference: RemoteReference): CharacterStyle };
}

export function createParagraphStyleClass(context: PhotoshopContext): { new (reference: RemoteReference): ParagraphStyle } {
  const properties = createParagraphStyleProperties();
  const classConfig = config(context, "paragraphStyle", properties, { reset: { mutating: true } }, PARAGRAPH_STYLE_PROPERTIES);
  class WebviewParagraphStyle extends RemoteClass {
    declare justification: Promise<string>; declare justificationFeatures: Promise<Record<string, unknown> | null>;
    declare leftIndent: Promise<number>; declare rightIndent: Promise<number>; declare firstLineIndent: Promise<number>;
    declare spaceBefore: Promise<number>; declare kashidaWidth: Promise<string>; declare kinsoku: Promise<string>;
    declare mojikumi: Promise<string>; declare spaceAfter: Promise<number>; declare hyphenation: Promise<boolean>;
    declare hyphenationFeatures: Promise<Record<string, unknown>>; declare layoutMode: Promise<string>;
    declare features: Promise<string>; declare reset: () => Promise<void>;
    constructor(source: RemoteReference | RemoteConstructionRequest) { super(classConfig, source); }
  }
  return WebviewParagraphStyle as unknown as { new (reference: RemoteReference): ParagraphStyle };
}

export function createTextWarpStyleClass(context: PhotoshopContext): { new (reference: RemoteReference): TextWarpStyle } {
  const properties = createTextWarpStyleProperties();
  const classConfig = config(context, "textWarpStyle", properties, { reset: { mutating: true } }, TEXT_WARP_STYLE_PROPERTIES);
  class WebviewTextWarpStyle extends RemoteClass {
    declare style: Promise<string>; declare direction: Promise<string>; declare bend: Promise<number>;
    declare horizontalDistortion: Promise<number>; declare verticalDistortion: Promise<number>;
    declare reset: () => Promise<void>;
    constructor(source: RemoteReference | RemoteConstructionRequest) { super(classConfig, source); }
  }
  return WebviewTextWarpStyle as unknown as { new (reference: RemoteReference): TextWarpStyle };
}

export function createTextItemClass(context: PhotoshopContext): { new (reference: RemoteReference): TextItem } {
  const properties = createTextItemProperties();
  const methods = createTextItemMethods();
  const classConfig = config(context, "textItem", properties, methods, TEXT_ITEM_WRITABLE);
  class WebviewTextItem extends RemoteClass {
    declare readonly parent: Promise<PsLayer>; declare readonly typename: Promise<"TextItem">;
    declare contents: Promise<string>; declare textClickPoint: Promise<PsPoint>; declare orientation: Promise<string>;
    declare readonly isPointText: Promise<boolean>; declare readonly isParagraphText: Promise<boolean>;
    declare readonly characterStyle: Promise<CharacterStyle>; declare readonly paragraphStyle: Promise<ParagraphStyle>;
    declare readonly warpStyle: Promise<TextWarpStyle>;
    declare convertToParagraphText: () => Promise<TextItem>;
    declare convertToPointText: () => Promise<TextItem>;
    declare convertToShape: () => Promise<void>; declare createWorkPath: () => Promise<void>;
    constructor(source: RemoteReference | RemoteConstructionRequest) { super(classConfig, source); }
  }
  return WebviewTextItem as unknown as { new (reference: RemoteReference): TextItem };
}
