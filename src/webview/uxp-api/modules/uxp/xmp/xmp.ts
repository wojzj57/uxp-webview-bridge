import { getBridgeRpcClient } from "@webview/runtime.js";
import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import { XMP_CONST } from "./constants.js";
import type {
  UxpXmp,
  XMPDateTime,
  XMPFile,
  XMPFileInfo,
  XMPIterator,
  XMPMeta,
  XMPNativeDateEnvelope,
  XMPPacketInfo,
  XMPProperty,
  XMPRemoteReference,
  XMPSerializedProperty,
  XMPSerializedValue,
  XMPUtils,
  XMPValue
} from "./types.js";

interface XmpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

type XmpHandleType = XMPRemoteReference["type"];
type DateTimePropertyName =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "nanosecond"
  | "tzSign"
  | "tzHour"
  | "tzMinute";

const DATE_TIME_PROPERTIES: readonly DateTimePropertyName[] = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "nanosecond",
  "tzSign",
  "tzHour",
  "tzMinute"
];

let defaultXmpNamespace: UxpXmp | undefined;

export function createUxpXmpNamespace(rpc: XmpRpc): UxpXmp {
  const XMPMetaProxy = createXMPMetaClass(rpc);
  const XMPFileProxy = createXMPFileClass(rpc);
  const XMPDateTimeProxy = createXMPDateTimeClass(rpc);
  const XMPIteratorProxy = createXMPIteratorClass();
  const XMPUtilsProxy = createXMPUtils(rpc);

  return {
    get XMPConst() {
      return XMP_CONST;
    },
    XMPDateTime: XMPDateTimeProxy,
    XMPFile: XMPFileProxy,
    XMPMeta: XMPMetaProxy,
    XMPIterator: XMPIteratorProxy as unknown as { new (): never },
    XMPUtils: XMPUtilsProxy
  };
}

function createXMPMetaClass(rpc: XmpRpc) {
  return class WebviewXMPMeta implements XMPMeta {
    readonly #referencePromise: Promise<XMPRemoteReference>;
    #queue: Promise<unknown> = Promise.resolve();

    constructor(packet?: string, buffer?: string | number[], reference?: XMPRemoteReference) {
      this.#referencePromise = reference
        ? Promise.resolve(reference)
        : rpc.call<XMPRemoteReference>(UXP_MODULE_ID, "xmp.meta.create", encodeImmediateArgs([packet, buffer]));
    }

    static deleteNamespace(namespaceURI: string): Promise<void> {
      return rpc.call<void>(UXP_MODULE_ID, "xmp.meta.deleteNamespace", [namespaceURI]);
    }

    static dumpNamespaces(): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "xmp.meta.dumpNamespaces");
    }

    static getNamespacePrefix(namespaceURI: string): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "xmp.meta.getNamespacePrefix", [namespaceURI]);
    }

    static getNamespaceURI(namespacePrefix: string): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "xmp.meta.getNamespaceURI", [namespacePrefix]);
    }

    static registerNamespace(namespaceURI: string, suggestedPrefix: string): Promise<string> {
      return rpc.call<string>(UXP_MODULE_ID, "xmp.meta.registerNamespace", [namespaceURI, suggestedPrefix]);
    }

    appendArrayItem(
      schemaNS: string,
      arrayName: string,
      itemValue: XMPValue,
      itemOptions?: number,
      arrayOptions?: number
    ): Promise<void> {
      return this.#call<void>("xmp.meta.appendArrayItem", [schemaNS, arrayName, itemValue, itemOptions, arrayOptions]);
    }

    countArrayItems(schemaNS: string, arrayName: string): Promise<number> {
      return this.#call<number>("xmp.meta.countArrayItems", [schemaNS, arrayName]);
    }

    deleteArrayItem(schemaNS: string, arrayName: string, itemIndex: number): Promise<void> {
      return this.#call<void>("xmp.meta.deleteArrayItem", [schemaNS, arrayName, itemIndex]);
    }

    deleteProperty(schemaNS: string, propName: string): Promise<void> {
      return this.#call<void>("xmp.meta.deleteProperty", [schemaNS, propName]);
    }

    deleteStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<void> {
      return this.#call<void>("xmp.meta.deleteStructField", [schemaNS, structName, fieldNS, fieldName]);
    }

    deleteQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<void> {
      return this.#call<void>("xmp.meta.deleteQualifier", [schemaNS, propName, qualNS, qualName]);
    }

    doesArrayItemExist(schemaNS: string, arrayName: string, itemIndex: number): Promise<boolean> {
      return this.#call<boolean>("xmp.meta.doesArrayItemExist", [schemaNS, arrayName, itemIndex]);
    }

    doesPropertyExist(schemaNS: string, propName: string): Promise<boolean> {
      return this.#call<boolean>("xmp.meta.doesPropertyExist", [schemaNS, propName]);
    }

    doesStructFieldExist(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<boolean> {
      return this.#call<boolean>("xmp.meta.doesStructFieldExist", [schemaNS, structName, fieldNS, fieldName]);
    }

    doesQualifierExist(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<boolean> {
      return this.#call<boolean>("xmp.meta.doesQualifierExist", [schemaNS, propName, qualNS, qualName]);
    }

    dumpObject(): Promise<string> {
      return this.#call<string>("xmp.meta.dumpObject");
    }

    async getArrayItem(schemaNS: string, arrayName: string, itemIndex: number): Promise<XMPProperty | null> {
      return deserializeProperty(rpc, await this.#call<XMPSerializedProperty | null>("xmp.meta.getArrayItem", [schemaNS, arrayName, itemIndex]));
    }

    async getLocalizedText(
      schemaNS: string,
      altTextName: string,
      genericLang: string,
      specificLang: string
    ): Promise<XMPProperty | null> {
      return deserializeProperty(
        rpc,
        await this.#call<XMPSerializedProperty | null>("xmp.meta.getLocalizedText", [
          schemaNS,
          altTextName,
          genericLang,
          specificLang
        ])
      );
    }

    async getProperty(schemaNS: string, propName: string, valueType?: string): Promise<XMPProperty | null> {
      return deserializeProperty(
        rpc,
        await this.#call<XMPSerializedProperty | null>("xmp.meta.getProperty", [schemaNS, propName, valueType])
      );
    }

    async getStructField(schemaNS: string, structName: string, fieldNS: string, fieldName: string): Promise<XMPProperty | null> {
      return deserializeProperty(
        rpc,
        await this.#call<XMPSerializedProperty | null>("xmp.meta.getStructField", [schemaNS, structName, fieldNS, fieldName])
      );
    }

    async getQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string): Promise<XMPProperty | null> {
      return deserializeProperty(
        rpc,
        await this.#call<XMPSerializedProperty | null>("xmp.meta.getQualifier", [schemaNS, propName, qualNS, qualName])
      );
    }

    insertArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): Promise<void> {
      return this.#call<void>("xmp.meta.insertArrayItem", [schemaNS, arrayName, itemIndex, itemValue, itemOptions]);
    }

    async iterator(options?: number, schemaNS?: string, propName?: string): Promise<XMPIterator> {
      const reference = await this.#call<XMPRemoteReference>("xmp.meta.iterator", [options, schemaNS, propName]);
      return createIteratorFromReference(rpc, reference);
    }

    serialize(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): Promise<string> {
      return this.#call<string>("xmp.meta.serialize", [options, padding, indent, newline, baseIndent]);
    }

    serializeToArray(options?: number, padding?: number, indent?: string, newline?: string, baseIndent?: number): Promise<number[]> {
      return this.#call<number[]>("xmp.meta.serializeToArray", [options, padding, indent, newline, baseIndent]);
    }

    setArrayItem(schemaNS: string, arrayName: string, itemIndex: number, itemValue: XMPValue, itemOptions?: number): Promise<void> {
      return this.#call<void>("xmp.meta.setArrayItem", [schemaNS, arrayName, itemIndex, itemValue, itemOptions]);
    }

    setLocalizedText(
      schemaNS: string,
      altTextName: string,
      genericLang: string,
      specificLang: string,
      itemValue: XMPValue,
      setOptions?: number
    ): Promise<void> {
      return this.#call<void>("xmp.meta.setLocalizedText", [
        schemaNS,
        altTextName,
        genericLang,
        specificLang,
        itemValue,
        setOptions
      ]);
    }

    setStructField(
      schemaNS: string,
      structName: string,
      fieldNS: string,
      fieldName: string,
      fieldValue: XMPValue,
      options?: number
    ): Promise<void> {
      return this.#call<void>("xmp.meta.setStructField", [schemaNS, structName, fieldNS, fieldName, fieldValue, options]);
    }

    setQualifier(schemaNS: string, propName: string, qualNS: string, qualName: string, qualValue: XMPValue, options?: number): Promise<void> {
      return this.#call<void>("xmp.meta.setQualifier", [schemaNS, propName, qualNS, qualName, qualValue, options]);
    }

    setProperty(schemaNS: string, propName: string, propValue: XMPValue, setOptions?: number, valueType?: string): Promise<void> {
      return this.#call<void>("xmp.meta.setProperty", [schemaNS, propName, propValue, setOptions, valueType]);
    }

    sort(): Promise<void> {
      return this.#call<void>("xmp.meta.sort");
    }

    async dispose(): Promise<void> {
      const reference = await this.#referencePromise;
      await rpc.call<void>(UXP_MODULE_ID, "xmp.meta.dispose", [reference]);
    }

    async toXmpRemoteReference(): Promise<XMPRemoteReference> {
      return this.#referencePromise;
    }

    async #call<T>(method: string, args: readonly unknown[] = []): Promise<T> {
      const reference = await this.#referencePromise;
      await this.#queue;
      return rpc.call<T>(UXP_MODULE_ID, method, [reference, ...(await encodeArgs(args))]);
    }
  };
}

function createXMPFileClass(rpc: XmpRpc) {
  return class WebviewXMPFile implements XMPFile {
    readonly #referencePromise: Promise<XMPRemoteReference>;
    #queue: Promise<unknown> = Promise.resolve();

    constructor(filePath?: string, format?: number, openFlags?: number, reference?: XMPRemoteReference) {
      this.#referencePromise = reference
        ? Promise.resolve(reference)
        : rpc.call<XMPRemoteReference>(UXP_MODULE_ID, "xmp.file.create", encodeImmediateArgs([filePath, format, openFlags]));
    }

    static getFormatInfo(format: number): Promise<number> {
      return rpc.call<number>(UXP_MODULE_ID, "xmp.file.getFormatInfo", [format]);
    }

    canPutXMP(xmpData: XMPMeta | string): Promise<boolean> {
      return this.#call<boolean>("xmp.file.canPutXMP", [xmpData]);
    }

    closeFile(closeFlags: number): Promise<void> {
      return this.#call<void>("xmp.file.closeFile", [closeFlags]);
    }

    async getXMP(): Promise<XMPMeta> {
      const reference = await this.#call<XMPRemoteReference>("xmp.file.getXMP");
      return createMetaFromReference(rpc, reference);
    }

    getPacketInfo(): Promise<XMPPacketInfo> {
      return this.#call<XMPPacketInfo>("xmp.file.getPacketInfo");
    }

    getFileInfo(): Promise<XMPFileInfo> {
      return this.#call<XMPFileInfo>("xmp.file.getFileInfo");
    }

    putXMP(xmpData: XMPMeta | string): Promise<void> {
      return this.#call<void>("xmp.file.putXMP", [xmpData]);
    }

    async dispose(): Promise<void> {
      const reference = await this.#referencePromise;
      await rpc.call<void>(UXP_MODULE_ID, "xmp.file.dispose", [reference]);
    }

    async toXmpRemoteReference(): Promise<XMPRemoteReference> {
      return this.#referencePromise;
    }

    async #call<T>(method: string, args: readonly unknown[] = []): Promise<T> {
      const reference = await this.#referencePromise;
      await this.#queue;
      return rpc.call<T>(UXP_MODULE_ID, method, [reference, ...(await encodeArgs(args))]);
    }
  };
}

function createXMPIteratorClass() {
  return class WebviewXMPIterator {
    constructor() {
      throw new Error("uxp.xmp.XMPIterator cannot be constructed directly. Use XMPMeta.iterator().");
    }
  };
}

function createIteratorFromReference(rpc: XmpRpc, reference: XMPRemoteReference): XMPIterator {
  return {
    async next() {
      return deserializeProperty(
        rpc,
        await rpc.call<XMPSerializedProperty | null>(UXP_MODULE_ID, "xmp.iterator.next", [reference])
      );
    },
    skipSiblings: () => rpc.call<void>(UXP_MODULE_ID, "xmp.iterator.skipSiblings", [reference]),
    skipSubtree: () => rpc.call<void>(UXP_MODULE_ID, "xmp.iterator.skipSubtree", [reference]),
    dispose: () => rpc.call<void>(UXP_MODULE_ID, "xmp.iterator.dispose", [reference]),
    toXmpRemoteReference: () => Promise.resolve(reference)
  } as XMPIterator;
}

function createXMPDateTimeClass(rpc: XmpRpc) {
  return class WebviewXMPDateTime implements XMPDateTime {
    readonly #referencePromise: Promise<XMPRemoteReference>;
    #queue: Promise<unknown> = Promise.resolve();

    constructor(date?: Date | string, reference?: XMPRemoteReference) {
      this.#referencePromise = reference
        ? Promise.resolve(reference)
        : rpc.call<XMPRemoteReference>(UXP_MODULE_ID, "xmp.dateTime.create", encodeImmediateArgs([date]));

      for (const property of DATE_TIME_PROPERTIES) {
        Object.defineProperty(this, property, {
          get: () => this.#getProperty(property),
          set: (value: number) => {
            this.#queue = this.#queue.then(async () => {
              const ref = await this.#referencePromise;
              await rpc.call<void>(UXP_MODULE_ID, "xmp.dateTime.setProperty", [ref, property, value]);
            });
            void this.#queue.catch(() => undefined);
          },
          enumerable: true
        });
      }
    }

    get year(): Promise<number> {
      return this.#getProperty("year");
    }
    set year(value: number) {
      this.#setProperty("year", value);
    }
    get month(): Promise<number> {
      return this.#getProperty("month");
    }
    set month(value: number) {
      this.#setProperty("month", value);
    }
    get day(): Promise<number> {
      return this.#getProperty("day");
    }
    set day(value: number) {
      this.#setProperty("day", value);
    }
    get hour(): Promise<number> {
      return this.#getProperty("hour");
    }
    set hour(value: number) {
      this.#setProperty("hour", value);
    }
    get minute(): Promise<number> {
      return this.#getProperty("minute");
    }
    set minute(value: number) {
      this.#setProperty("minute", value);
    }
    get second(): Promise<number> {
      return this.#getProperty("second");
    }
    set second(value: number) {
      this.#setProperty("second", value);
    }
    get nanosecond(): Promise<number> {
      return this.#getProperty("nanosecond");
    }
    set nanosecond(value: number) {
      this.#setProperty("nanosecond", value);
    }
    get tzSign(): Promise<number> {
      return this.#getProperty("tzSign");
    }
    set tzSign(value: number) {
      this.#setProperty("tzSign", value);
    }
    get tzHour(): Promise<number> {
      return this.#getProperty("tzHour");
    }
    set tzHour(value: number) {
      this.#setProperty("tzHour", value);
    }
    get tzMinute(): Promise<number> {
      return this.#getProperty("tzMinute");
    }
    set tzMinute(value: number) {
      this.#setProperty("tzMinute", value);
    }

    compareTo(dateTime: XMPDateTime): Promise<number> {
      return this.#call<number>("xmp.dateTime.compareTo", [dateTime]);
    }

    convertToLocalTime(): Promise<void> {
      return this.#call<void>("xmp.dateTime.convertToLocalTime");
    }

    convertToUTCTime(): Promise<void> {
      return this.#call<void>("xmp.dateTime.convertToUTCTime");
    }

    async getDate(): Promise<Date> {
      const iso = await this.#call<string>("xmp.dateTime.getDate");
      return new Date(iso);
    }

    setLocalTimeZone(): Promise<void> {
      return this.#call<void>("xmp.dateTime.setLocalTimeZone");
    }

    hasDate(): Promise<boolean> {
      return this.#call<boolean>("xmp.dateTime.hasDate");
    }

    hasTime(): Promise<boolean> {
      return this.#call<boolean>("xmp.dateTime.hasTime");
    }

    hasTimeZone(): Promise<boolean> {
      return this.#call<boolean>("xmp.dateTime.hasTimeZone");
    }

    toString(): Promise<string> {
      return this.#call<string>("xmp.dateTime.toString");
    }

    async dispose(): Promise<void> {
      const reference = await this.#referencePromise;
      await rpc.call<void>(UXP_MODULE_ID, "xmp.dateTime.dispose", [reference]);
    }

    async toXmpRemoteReference(): Promise<XMPRemoteReference> {
      return this.#referencePromise;
    }

    async #getProperty(name: DateTimePropertyName): Promise<number> {
      const reference = await this.#referencePromise;
      await this.#queue;
      return rpc.call<number>(UXP_MODULE_ID, "xmp.dateTime.getProperty", [reference, name]);
    }

    #setProperty(name: DateTimePropertyName, value: number): void {
      this.#queue = this.#queue.then(async () => {
        const reference = await this.#referencePromise;
        await rpc.call<void>(UXP_MODULE_ID, "xmp.dateTime.setProperty", [reference, name, value]);
      });
      void this.#queue.catch(() => undefined);
    }

    async #call<T>(method: string, args: readonly unknown[] = []): Promise<T> {
      const reference = await this.#referencePromise;
      await this.#queue;
      return rpc.call<T>(UXP_MODULE_ID, method, [reference, ...(await encodeArgs(args))]);
    }
  };
}

function createXMPUtils(rpc: XmpRpc): XMPUtils {
  return {
    appendProperties: (source, dest, options) =>
      callWithEncodedArgs<void>(rpc, "xmp.utils.appendProperties", [source, dest, options]),
    catenateArrayItems: (xmpObj, schemaNS, arrayName, separator, quotes, options) =>
      callWithEncodedArgs<string>(rpc, "xmp.utils.catenateArrayItems", [
        xmpObj,
        schemaNS,
        arrayName,
        separator,
        quotes,
        options
      ]),
    composeArrayItemPath: (schemaNS, arrayName, itemIndex) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeArrayItemPath", [schemaNS, arrayName, itemIndex]),
    composeFieldSelector: (schemaNS, arrayName, fieldNS, fieldName, fieldValue) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeFieldSelector", [
        schemaNS,
        arrayName,
        fieldNS,
        fieldName,
        fieldValue
      ]),
    composeLangSelector: (schemaNS, arrayName, locale) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeLangSelector", [schemaNS, arrayName, locale]),
    composeStructFieldPath: (schemaNS, structName, fieldNS, fieldName) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeStructFieldPath", [schemaNS, structName, fieldNS, fieldName]),
    composeQualifierPath: (schemaNS, propName, qualNS, qualName) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeQualifierPath", [schemaNS, propName, qualNS, qualName]),
    duplicateSubtree: (source, dest, sourceNS, sourceRoot, destNS, destRoot, options) =>
      callWithEncodedArgs<void>(rpc, "xmp.utils.duplicateSubtree", [
        source,
        dest,
        sourceNS,
        sourceRoot,
        destNS,
        destRoot,
        options
      ]),
    removeProperties: (xmpObj, schemaNS, propName, options) =>
      callWithEncodedArgs<void>(rpc, "xmp.utils.removeProperties", [xmpObj, schemaNS, propName, options]),
    separateArrayItems: (xmpObj, schemaNS, arrayName, arrayOptions, concatString) =>
      callWithEncodedArgs<void>(rpc, "xmp.utils.separateArrayItems", [
        xmpObj,
        schemaNS,
        arrayName,
        arrayOptions,
        concatString
      ])
  };
}

function createMetaFromReference(rpc: XmpRpc, reference: XMPRemoteReference): XMPMeta {
  const XMPMetaProxy = createXMPMetaClass(rpc);
  return new XMPMetaProxy(undefined, undefined, reference);
}

function createDateTimeFromReference(rpc: XmpRpc, reference: XMPRemoteReference): XMPDateTime {
  const XMPDateTimeProxy = createXMPDateTimeClass(rpc);
  return new XMPDateTimeProxy(undefined, reference);
}

function deserializeProperty(rpc: XmpRpc, value: XMPSerializedProperty | null | undefined): XMPProperty | null {
  if (!value) {
    return null;
  }

  const deserializedValue = deserializeValue(rpc, value.value);
  return {
    locale: value.locale ?? "",
    namespace: value.namespace ?? "",
    options: value.options ?? 0,
    path: value.path ?? "",
    value: deserializedValue,
    toString: () => value.stringValue ?? String(deserializedValue ?? "")
  };
}

function deserializeValue(rpc: XmpRpc, value: XMPSerializedValue | undefined): XMPValue | null {
  if (isXmpReference(value) && value.type === "XMPDateTime") {
    return createDateTimeFromReference(rpc, value);
  }

  if (isXmpReference(value)) {
    return null;
  }

  if (value && typeof value === "object") {
    return null;
  }

  return value ?? null;
}

async function callWithEncodedArgs<T>(rpc: XmpRpc, method: string, args: readonly unknown[]): Promise<T> {
  return rpc.call<T>(UXP_MODULE_ID, method, await encodeArgs(args));
}

function encodeImmediateArgs(args: readonly unknown[]): unknown[] {
  return trimTrailingUndefined(args.map((arg) => {
    if (arg instanceof Date) {
      const envelope: XMPNativeDateEnvelope = {
        kind: "uxp.xmp.nativeDate",
        iso: arg.toISOString()
      };
      return envelope;
    }
    return arg;
  }));
}

async function encodeArgs(args: readonly unknown[]): Promise<unknown[]> {
  return trimTrailingUndefined(await Promise.all(args.map((arg) => encodeValue(arg))));
}

async function encodeValue(value: unknown): Promise<unknown> {
  if (isRemoteProxy(value)) {
    return value.toXmpRemoteReference();
  }

  if (value instanceof Date) {
    const envelope: XMPNativeDateEnvelope = {
      kind: "uxp.xmp.nativeDate",
      iso: value.toISOString()
    };
    return envelope;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => encodeValue(item)));
  }

  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nestedValue]) => [key, await encodeValue(nestedValue)] as const)
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function isRemoteProxy(value: unknown): value is { toXmpRemoteReference(): Promise<XMPRemoteReference> } {
  return (
    !!value &&
    typeof value === "object" &&
    "toXmpRemoteReference" in value &&
    typeof (value as { toXmpRemoteReference?: unknown }).toXmpRemoteReference === "function"
  );
}

function isXmpReference(value: unknown): value is XMPRemoteReference {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "uxp.xmp.ref" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function trimTrailingUndefined(values: unknown[]): unknown[] {
  let lastIndex = values.length - 1;
  while (lastIndex >= 0 && values[lastIndex] === undefined) {
    lastIndex -= 1;
  }
  return values.slice(0, lastIndex + 1);
}

export const xmp: UxpXmp =
  defaultXmpNamespace ??
  (defaultXmpNamespace = createUxpXmpNamespace({
    call: <T>(module: string, method: string, args?: readonly unknown[]) =>
      getBridgeRpcClient().call<T>(module, method, args)
  }));
