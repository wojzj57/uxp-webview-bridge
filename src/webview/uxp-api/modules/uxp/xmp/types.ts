import type {
  XMPConst as NativeXMPConst,
  XMPDateTime as NativeXMPDateTime,
  XMPFile as NativeXMPFile,
  XMPFileInfo,
  XMPIterator as NativeXMPIterator,
  XMPMeta as NativeXMPMeta,
  XMPPacketInfo,
  XMPProperty as NativeXMPProperty,
  XMPUtils as NativeXMPUtils,
  XMPValue as NativeXMPValue
} from "@shared/types/uxp/internal/xmp.js";

export type XMPConst = NativeXMPConst;
export type XMPPrimitiveValue = string | number | boolean;
export type XMPValue = XMPPrimitiveValue | XMPDateTime;
export type XMPSerializedValue = XMPPrimitiveValue | XMPRemoteReference | XMPNativeDateEnvelope | null;

export interface XMPRemoteReference {
  readonly kind: "uxp.xmp.ref";
  readonly type: "XMPMeta" | "XMPFile" | "XMPIterator" | "XMPDateTime";
  readonly id: string;
}

export interface XMPNativeDateEnvelope {
  readonly kind: "uxp.xmp.nativeDate";
  readonly iso: string;
}

export interface XMPSerializedProperty {
  readonly locale?: string;
  readonly namespace?: string;
  readonly options?: number;
  readonly path?: string;
  readonly value?: XMPSerializedValue;
  readonly stringValue?: string;
}

export type XMPProperty = Omit<NativeXMPProperty, "value"> & {
  readonly value: XMPValue | null;
};

export type { XMPFileInfo, XMPPacketInfo };

export interface XMPDateTime {
  year: Promise<number>;
  month: Promise<number>;
  day: Promise<number>;
  hour: Promise<number>;
  minute: Promise<number>;
  second: Promise<number>;
  nanosecond: Promise<number>;
  tzSign: Promise<number>;
  tzHour: Promise<number>;
  tzMinute: Promise<number>;
  compareTo(dateTime: XMPDateTime): Promise<number>;
  convertToLocalTime(): Promise<void>;
  convertToUTCTime(): Promise<void>;
  getDate(): Promise<Date>;
  setLocalTimeZone(): Promise<void>;
  hasDate(): Promise<boolean>;
  hasTime(): Promise<boolean>;
  hasTimeZone(): Promise<boolean>;
  toString(): Promise<string>;
  dispose(): Promise<void>;
}

export interface XMPMeta
  extends Omit<
    NativeXMPMeta,
    | "appendArrayItem"
    | "countArrayItems"
    | "deleteArrayItem"
    | "deleteProperty"
    | "deleteStructField"
    | "deleteQualifier"
    | "doesArrayItemExist"
    | "doesPropertyExist"
    | "doesStructFieldExist"
    | "doesQualifierExist"
    | "dumpObject"
    | "getArrayItem"
    | "getLocalizedText"
    | "getProperty"
    | "getStructField"
    | "getQualifier"
    | "insertArrayItem"
    | "iterator"
    | "serialize"
    | "serializeToArray"
    | "setArrayItem"
    | "setLocalizedText"
    | "setStructField"
    | "setQualifier"
    | "setProperty"
    | "sort"
  > {
  appendArrayItem(
    schemaNS: string,
    arrayName: string,
    itemValue: XMPValue,
    itemOptions?: number,
    arrayOptions?: number
  ): Promise<void>;
  countArrayItems(schemaNS: string, arrayName: string): Promise<number>;
  deleteArrayItem(schemaNS: string, arrayName: string, itemIndex: number): Promise<void>;
  deleteProperty(schemaNS: string, propName: string): Promise<void>;
  deleteStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<void>;
  deleteQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<void>;
  doesArrayItemExist(schemaNS: string, arrayName: string, itemIndex: number): Promise<boolean>;
  doesPropertyExist(schemaNS: string, propName: string): Promise<boolean>;
  doesStructFieldExist(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<boolean>;
  doesQualifierExist(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<boolean>;
  dumpObject(): Promise<string>;
  getArrayItem(schemaNS: string, arrayName: string, itemIndex: number): Promise<XMPProperty | null>;
  getLocalizedText(schemaNS: string, altTextName: string, genericLang: string, specificLang: string): Promise<XMPProperty | null>;
  getProperty(schemaNS: string, propName: string, valueType?: string): Promise<XMPProperty | null>;
  getStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<XMPProperty | null>;
  getQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<XMPProperty | null>;
  insertArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): Promise<void>;
  iterator(options?: number, schemaNS?: string, propName?: string): Promise<XMPIterator>;
  serialize(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): Promise<string>;
  serializeToArray(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): Promise<number[]>;
  setArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): Promise<void>;
  setLocalizedText(
    schemaNS: string,
    altTextName: string,
    genericLang: string,
    specificLang: string,
    itemValue: XMPValue,
    setOptions?: number
  ): Promise<void>;
  setStructField(
    schemaNS: string,
    structName: string,
    fieldNS: string,
    fieldName: string,
    fieldValue: XMPValue,
    options?: number
  ): Promise<void>;
  setQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string, qualValue: XMPValue, options?: number): Promise<void>;
  setProperty(schemaNS: string, propName: string, propValue: XMPValue, setOptions?: number, valueType?: string): Promise<void>;
  sort(): Promise<void>;
  dispose(): Promise<void>;
}

export interface XMPMetaConstructor {
  new (packet?: string, buffer?: string | number[]): XMPMeta;
  deleteNamespace(namespaceURI: string): Promise<void>;
  dumpNamespaces(): Promise<string>;
  getNamespacePrefix(namespaceURI: string): Promise<string>;
  getNamespaceURI(namespacePrefix: string): Promise<string>;
  registerNamespace(namespaceURI: string, suggestedPrefix: string): Promise<string>;
}

export interface XMPFile
  extends Omit<NativeXMPFile, "canPutXMP" | "closeFile" | "getXMP" | "getPacketInfo" | "getFileInfo" | "putXMP"> {
  canPutXMP(xmpData: XMPMeta | string): Promise<boolean>;
  closeFile(closeFlags: number): Promise<void>;
  getXMP(): Promise<XMPMeta>;
  getPacketInfo(): Promise<XMPPacketInfo>;
  getFileInfo(): Promise<XMPFileInfo>;
  putXMP(xmpData: XMPMeta | string): Promise<void>;
  dispose(): Promise<void>;
}

export interface XMPFileConstructor {
  new (filePath?: string, format?: number, openFlags?: number): XMPFile;
  getFormatInfo(format: number): Promise<number>;
}

export interface XMPIterator extends Omit<NativeXMPIterator, "next" | "skipSiblings" | "skipSubtree"> {
  next(): Promise<XMPProperty | null>;
  skipSiblings(): Promise<void>;
  skipSubtree(): Promise<void>;
  dispose(): Promise<void>;
}

export interface XMPUtils {
  appendProperties(source: XMPMeta, dest: XMPMeta, options?: number): Promise<void>;
  catenateArrayItems(
    xmpObj: XMPMeta,
    schemaNS: string,
    arrayName: string,
    separator?: string,
    quotes?: string,
    options?: number
  ): Promise<string>;
  composeArrayItemPath(schemaNS: string, arrayName: string, itemIndex: number): Promise<string>;
  composeFieldSelector(schemaNS: string, arrayName: string, fieldNS: string, fieldName: string, fieldValue: string): Promise<string>;
  composeLangSelector(schemaNS: string, arrayName: string, locale: string): Promise<string>;
  composeStructFieldPath(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<string>;
  composeQualifierPath(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<string>;
  duplicateSubtree(
    source: XMPMeta,
    dest: XMPMeta,
    sourceNS: string,
    sourceRoot: string,
    destNS: string,
    destRoot?: string,
    options?: number
  ): Promise<void>;
  removeProperties(xmpObj: XMPMeta, schemaNS?: string, propName?: string, options?: number): Promise<void>;
  separateArrayItems(xmpObj: XMPMeta, schemaNS: string, arrayName: string, arrayOptions: number | undefined, concatString: string): Promise<void>;
}

export interface UxpXmp {
  readonly XMPConst: XMPConst;
  readonly XMPDateTime: {
    new (date?: Date | string): XMPDateTime;
  };
  readonly XMPFile: XMPFileConstructor;
  readonly XMPMeta: XMPMetaConstructor;
  readonly XMPIterator: {
    new (): never;
  };
  readonly XMPUtils: XMPUtils;
}

export type NativeXMPInputValue = NativeXMPValue | XMPMeta | XMPDateTime;
