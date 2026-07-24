export type XMPValue = string | number | boolean | XMPDateTime;

export interface XMPConst {
  readonly [name: string]: string | number | boolean;
}

export class XMPDateTime {
  constructor();
  constructor(date: Date | string);
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  nanosecond: number;
  tzSign: number;
  tzHour: number;
  tzMinute: number;
  compareTo(dateTime: XMPDateTime): number;
  convertToLocalTime(): void;
  convertToUTCTime(): void;
  getDate(): Date;
  setLocalTimeZone(): void;
  hasDate(): boolean;
  hasTime(): boolean;
  hasTimeZone(): boolean;
  toString(): string;
}

export class XMPFile {
  constructor();
  constructor(filePath: string, format: number, openFlags: number);
  canPutXMP(xmpData: XMPMeta | string): boolean;
  closeFile(closeFlags: number): void;
  getXMP(): XMPMeta;
  getPacketInfo(): XMPPacketInfo;
  getFileInfo(): XMPFileInfo;
  putXMP(xmpData: XMPMeta | string): void;
  static getFormatInfo(format: number): number;
}

export interface XMPFileInfo {
  readonly filePath: string;
  readonly format: number;
  readonly handlerFlags: number;
  readonly openFlags: number;
}

export class XMPIterator {
  next(): XMPProperty | null | undefined;
  skipSiblings(): void;
  skipSubtree(): void;
}

export class XMPMeta {
  constructor();
  constructor(packet: string, buffer?: string | number[]);
  appendArrayItem(
    schemaNS: string,
    arrayName: string,
    itemValue: XMPValue,
    itemOptions?: number,
    arrayOptions?: number
  ): void;
  countArrayItems(schemaNS: string, arrayName: string): number;
  deleteArrayItem(schemaNS: string, arrayName: string, itemIndex: number): void;
  deleteProperty(schemaNS: string, propName: string): void;
  deleteStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): void;
  deleteQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): void;
  doesArrayItemExist(schemaNS: string, arrayName: string, itemIndex: number): boolean;
  doesPropertyExist(schemaNS: string, propName: string): boolean;
  doesStructFieldExist(schemaNS: string, structName: string, fieldNS: string, fieldName: string): boolean;
  doesQualifierExist(schemaNS: string, propName: string, qualNS: string, qualName: string): boolean;
  dumpObject(): string;
  getArrayItem(schemaNS: string, arrayName: string, itemIndex: number): XMPProperty | null | undefined;
  getLocalizedText(schemaNS: string, altTextName: string, genericLang: string, specificLang: string): XMPProperty | null | undefined;
  getProperty(schemaNS: string, propName: string, valueType?: string): XMPProperty | null | undefined;
  getStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): XMPProperty | null | undefined;
  getQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): XMPProperty | null | undefined;
  insertArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): void;
  iterator(options?: number, schemaNS?: string, propName?: string): XMPIterator;
  serialize(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): string;
  serializeToArray(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): number[];
  setArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): void;
  setLocalizedText(
    schemaNS: string,
    altTextName: string,
    genericLang: string,
    specificLang: string,
    itemValue: XMPValue,
    setOptions?: number
  ): void;
  setStructField(
    schemaNS: string,
    structName: string,
    fieldNS: string,
    fieldName: string,
    fieldValue: XMPValue,
    options?: number
  ): void;
  setQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string, qualValue: XMPValue, options?: number): void;
  setProperty(schemaNS: string, propName: string, propValue: XMPValue, setOptions?: number, valueType?: string): void;
  sort(): void;
  static deleteNamespace(namespaceURI: string): void;
  static dumpNamespaces(): string;
  static getNamespacePrefix(namespaceURI: string): string;
  static getNamespaceURI(namespacePrefix: string): string;
  static registerNamespace(namespaceURI: string, suggestedPrefix: string): string;
}

export interface XMPPacketInfo {
  readonly charForm: number;
  readonly length: number;
  readonly offset: number;
  readonly packet: string;
  readonly padSize: number;
  readonly writeable: boolean;
}

export interface XMPProperty {
  readonly locale: string;
  readonly namespace: string;
  readonly options: number;
  readonly path: string;
  readonly value: XMPValue;
  toString(): string;
}

export class XMPUtils {
  private constructor();
  static appendProperties(source: XMPMeta, dest: XMPMeta, options?: number): void;
  static catenateArrayItems(
    xmpObj: XMPMeta,
    schemaNS: string,
    arrayName: string,
    separator?: string,
    quotes?: string,
    options?: number
  ): string;
  static composeArrayItemPath(schemaNS: string, arrayName: string, itemIndex: number): string;
  static composeFieldSelector(schemaNS: string, arrayName: string, fieldNS: string, fieldName: string, fieldValue: string): string;
  static composeLangSelector(schemaNS: string, arrayName: string, locale: string): string;
  static composeStructFieldPath(schemaNS: string, structName: string, fieldNS: string, fieldName: string): string;
  static composeQualifierPath(schemaNS: string, propName: string, qualNS: string, qualName: string): string;
  static duplicateSubtree(
    source: XMPMeta,
    dest: XMPMeta,
    sourceNS: string,
    sourceRoot: string,
    destNS: string,
    destRoot?: string,
    options?: number
  ): void;
  static removeProperties(xmpObj: XMPMeta, schemaNS?: string, propName?: string, options?: number): void;
  static separateArrayItems(xmpObj: XMPMeta, schemaNS: string, arrayName: string, arrayOptions: number | undefined, concatString: string): void;
}

export const xmp: {
  readonly XMPConst: XMPConst;
  readonly XMPDateTime: typeof XMPDateTime;
  readonly XMPFile: typeof XMPFile;
  readonly XMPMeta: typeof XMPMeta;
  readonly XMPIterator: typeof XMPIterator;
  readonly XMPUtils: typeof XMPUtils;
};
