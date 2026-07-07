import { getBridgeRpcClient } from "@webview/runtime.js";
import { UXP_MODULE_ID } from "@shared/uxp-api/uxp-protocol.js";
import {
  createIdentityCache,
  encodeRemoteArgs,
  isRemoteReference,
  RemoteClass,
  type IdentityCache,
  type RemoteArgEncoder,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference,
  type RemoteRpc,
  type RemoteValueDecoder
} from "@webview/uxp-api/remote/index.js";
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
  XMPSerializedProperty,
  XMPSerializedValue,
  XMPUtils,
  XMPValue
} from "./types.js";

type XmpRpc = RemoteRpc;

const DATE_TIME_PROPERTY_NAMES = [
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
] as const;

let defaultXmpNamespace: UxpXmp | undefined;

export function createUxpXmpNamespace(rpc: XmpRpc): UxpXmp {
  const context = createXmpContext(rpc);

  return {
    get XMPConst() {
      return XMP_CONST;
    },
    XMPDateTime: context.XMPDateTime,
    XMPFile: context.XMPFile,
    XMPMeta: context.XMPMeta,
    XMPIterator: context.XMPIterator as unknown as { new (): never },
    XMPUtils: context.XMPUtils
  };
}

/**
 * Per-namespace state: the reference->instance identity caches and the four remote classes, all
 * sharing one rpc client and the module-neutral remote codec.
 */
interface XmpContext {
  readonly XMPMeta: WebviewXMPMetaConstructor;
  readonly XMPFile: WebviewXMPFileConstructor;
  readonly XMPDateTime: WebviewXMPDateTimeConstructor;
  readonly XMPIterator: { new (): never };
  readonly XMPUtils: XMPUtils;
}

interface WebviewXMPMetaConstructor {
  new (packet?: string, buffer?: string | number[], reference?: RemoteReference): XMPMeta;
  deleteNamespace(namespaceURI: string): Promise<void>;
  dumpNamespaces(): Promise<string>;
  getNamespacePrefix(namespaceURI: string): Promise<string>;
  getNamespaceURI(namespacePrefix: string): Promise<string>;
  registerNamespace(namespaceURI: string, suggestedPrefix: string): Promise<string>;
}

interface WebviewXMPFileConstructor {
  new (filePath?: string, format?: number, openFlags?: number, reference?: RemoteReference): XMPFile;
  getFormatInfo(format: number): Promise<number>;
}

interface WebviewXMPDateTimeConstructor {
  new (date?: Date | string, reference?: RemoteReference): XMPDateTime;
}

function createXmpContext(rpc: XmpRpc): XmpContext {
  const metaCache = createIdentityCache<XMPMeta>();
  const dateTimeCache = createIdentityCache<XMPDateTime>();
  const iteratorCache = createIdentityCache<XMPIterator>();

  // The XMP native-Date envelope is a domain-specific transport form; kept out of the generic base.
  const nativeDateEncoder: RemoteArgEncoder = (value) => {
    if (value instanceof Date) {
      return { kind: "uxp.xmp.nativeDate", iso: value.toISOString() } satisfies XMPNativeDateEnvelope;
    }
    return undefined;
  };
  const argEncoders = [nativeDateEncoder];

  // Decodes an XMPDateTime reference envelope that appears as a property value into an instance.
  const dateTimeValueDecoder: RemoteValueDecoder = (value) => {
    if (isRemoteReference(value) && value.type === "XMPDateTime") {
      return getOrCreateDateTime(value);
    }
    return undefined;
  };

  const metaMethodNames: RemoteMethodNames = {
    propertyGet: {},
    propertySet: {},
    method: {
      appendArrayItem: "xmp.meta.appendArrayItem",
      countArrayItems: "xmp.meta.countArrayItems",
      deleteArrayItem: "xmp.meta.deleteArrayItem",
      deleteProperty: "xmp.meta.deleteProperty",
      deleteStructField: "xmp.meta.deleteStructField",
      deleteQualifier: "xmp.meta.deleteQualifier",
      doesArrayItemExist: "xmp.meta.doesArrayItemExist",
      doesPropertyExist: "xmp.meta.doesPropertyExist",
      doesStructFieldExist: "xmp.meta.doesStructFieldExist",
      doesQualifierExist: "xmp.meta.doesQualifierExist",
      dumpObject: "xmp.meta.dumpObject",
      getArrayItem: "xmp.meta.getArrayItem",
      getLocalizedText: "xmp.meta.getLocalizedText",
      getProperty: "xmp.meta.getProperty",
      getStructField: "xmp.meta.getStructField",
      getQualifier: "xmp.meta.getQualifier",
      insertArrayItem: "xmp.meta.insertArrayItem",
      iterator: "xmp.meta.iterator",
      serialize: "xmp.meta.serialize",
      serializeToArray: "xmp.meta.serializeToArray",
      setArrayItem: "xmp.meta.setArrayItem",
      setLocalizedText: "xmp.meta.setLocalizedText",
      setStructField: "xmp.meta.setStructField",
      setQualifier: "xmp.meta.setQualifier",
      setProperty: "xmp.meta.setProperty",
      sort: "xmp.meta.sort"
    },
    dispose: "xmp.meta.dispose"
  };

  const propertyDecoder: RemoteValueDecoder = (value) =>
    deserializeProperty(value as XMPSerializedProperty | null | undefined, dateTimeValueDecoder);
  const iteratorDecoder: RemoteValueDecoder = (value) =>
    isRemoteReference(value) && value.type === "XMPIterator" ? getOrCreateIterator(value) : undefined;

  const metaMethods = {
    appendArrayItem: {},
    countArrayItems: {},
    deleteArrayItem: {},
    deleteProperty: {},
    deleteStructField: {},
    deleteQualifier: {},
    doesArrayItemExist: {},
    doesPropertyExist: {},
    doesStructFieldExist: {},
    doesQualifierExist: {},
    dumpObject: {},
    getArrayItem: { decode: propertyDecoder },
    getLocalizedText: { decode: propertyDecoder },
    getProperty: { decode: propertyDecoder },
    getStructField: { decode: propertyDecoder },
    getQualifier: { decode: propertyDecoder },
    insertArrayItem: {},
    iterator: { decode: iteratorDecoder },
    serialize: {},
    serializeToArray: {},
    setArrayItem: {},
    setLocalizedText: {},
    setStructField: {},
    setQualifier: {},
    setProperty: {},
    sort: {}
  } as const;

  const metaConfigBase: Omit<RemoteClassConfig, never> = {
    rpc,
    moduleId: UXP_MODULE_ID,
    methodNames: metaMethodNames,
    properties: {},
    methods: metaMethods,
    argEncoders
  };

  class WebviewXMPMeta extends RemoteClass implements XMPMeta {
    declare appendArrayItem: (
      schemaNS: string,
      arrayName: string,
      itemValue: XMPValue,
      itemOptions?: number,
      arrayOptions?: number
    ) => Promise<void>;
    declare countArrayItems: (schemaNS: string, arrayName: string) => Promise<number>;
    declare deleteArrayItem: (schemaNS: string, arrayName: string, itemIndex: number) => Promise<void>;
    declare deleteProperty: (schemaNS: string, propName: string) => Promise<void>;
    declare deleteStructField: (schemaNS: string, structName: string, fieldNS: string, fieldName: string) => Promise<void>;
    declare deleteQualifier: (schemaNS: string, propName: string, qualNS: string, qualName: string) => Promise<void>;
    declare doesArrayItemExist: (schemaNS: string, arrayName: string, itemIndex: number) => Promise<boolean>;
    declare doesPropertyExist: (schemaNS: string, propName: string) => Promise<boolean>;
    declare doesStructFieldExist: (schemaNS: string, structName: string, fieldNS: string, fieldName: string) => Promise<boolean>;
    declare doesQualifierExist: (schemaNS: string, propName: string, qualNS: string, qualName: string) => Promise<boolean>;
    declare dumpObject: () => Promise<string>;
    declare getArrayItem: (schemaNS: string, arrayName: string, itemIndex: number) => Promise<XMPProperty | null>;
    declare getLocalizedText: (
      schemaNS: string,
      altTextName: string,
      genericLang: string,
      specificLang: string
    ) => Promise<XMPProperty | null>;
    declare getProperty: (schemaNS: string, propName: string, valueType?: string) => Promise<XMPProperty | null>;
    declare getStructField: (
      schemaNS: string,
      structName: string,
      fieldNS: string,
      fieldName: string
    ) => Promise<XMPProperty | null>;
    declare getQualifier: (
      schemaNS: string,
      propName: string,
      qualNS: string,
      qualName: string
    ) => Promise<XMPProperty | null>;
    declare insertArrayItem: (
      schemaNS: string,
      arrayName: string,
      itemIndex: number,
      itemValue: XMPValue,
      itemOptions?: number
    ) => Promise<void>;
    declare iterator: (options?: number, schemaNS?: string, propName?: string) => Promise<XMPIterator>;
    declare serialize: (
      options?: number,
      padding?: number,
      indent?: string,
      newline?: string,
      baseIndent?: number
    ) => Promise<string>;
    declare serializeToArray: (
      options?: number,
      padding?: number,
      indent?: string,
      newline?: string,
      baseIndent?: number
    ) => Promise<number[]>;
    declare setArrayItem: (
      schemaNS: string,
      arrayName: string,
      itemIndex: number,
      itemValue: XMPValue,
      itemOptions?: number
    ) => Promise<void>;
    declare setLocalizedText: (
      schemaNS: string,
      altTextName: string,
      genericLang: string,
      specificLang: string,
      itemValue: XMPValue,
      setOptions?: number
    ) => Promise<void>;
    declare setStructField: (
      schemaNS: string,
      structName: string,
      fieldNS: string,
      fieldName: string,
      fieldValue: XMPValue,
      options?: number
    ) => Promise<void>;
    declare setQualifier: (
      schemaNS: string,
      propName: string,
      qualNS: string,
      qualName: string,
      qualValue: XMPValue,
      options?: number
    ) => Promise<void>;
    declare setProperty: (
      schemaNS: string,
      propName: string,
      propValue: XMPValue,
      setOptions?: number,
      valueType?: string
    ) => Promise<void>;
    declare sort: () => Promise<void>;

    constructor(packet?: string, buffer?: string | number[], reference?: RemoteReference) {
      super(metaConfigBase, reference ?? metaConstruction(packet, buffer));
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
  }

  const fileMethodNames: RemoteMethodNames = {
    propertyGet: {},
    propertySet: {},
    method: {
      canPutXMP: "xmp.file.canPutXMP",
      closeFile: "xmp.file.closeFile",
      getXMP: "xmp.file.getXMP",
      getPacketInfo: "xmp.file.getPacketInfo",
      getFileInfo: "xmp.file.getFileInfo",
      putXMP: "xmp.file.putXMP"
    },
    dispose: "xmp.file.dispose"
  };

  const metaReferenceDecoder: RemoteValueDecoder = (value) =>
    isRemoteReference(value) && value.type === "XMPMeta" ? getOrCreateMeta(value) : undefined;

  const fileMethods = {
    canPutXMP: {},
    closeFile: {},
    getXMP: { decode: metaReferenceDecoder },
    getPacketInfo: {},
    getFileInfo: {},
    putXMP: {}
  } as const;

  const fileConfig: RemoteClassConfig = {
    rpc,
    moduleId: UXP_MODULE_ID,
    methodNames: fileMethodNames,
    properties: {},
    methods: fileMethods,
    argEncoders
  };

  class WebviewXMPFile extends RemoteClass implements XMPFile {
    declare canPutXMP: (xmpData: XMPMeta | string) => Promise<boolean>;
    declare closeFile: (closeFlags: number) => Promise<void>;
    declare getXMP: () => Promise<XMPMeta>;
    declare getPacketInfo: () => Promise<XMPPacketInfo>;
    declare getFileInfo: () => Promise<XMPFileInfo>;
    declare putXMP: (xmpData: XMPMeta | string) => Promise<void>;

    constructor(filePath?: string, format?: number, openFlags?: number, reference?: RemoteReference) {
      super(fileConfig, reference ?? fileConstruction(filePath, format, openFlags));
    }

    static getFormatInfo(format: number): Promise<number> {
      return rpc.call<number>(UXP_MODULE_ID, "xmp.file.getFormatInfo", [format]);
    }
  }

  const iteratorMethodNames: RemoteMethodNames = {
    propertyGet: {},
    propertySet: {},
    method: {
      next: "xmp.iterator.next",
      skipSiblings: "xmp.iterator.skipSiblings",
      skipSubtree: "xmp.iterator.skipSubtree"
    },
    dispose: "xmp.iterator.dispose"
  };

  const iteratorMethods = {
    next: { decode: propertyDecoder },
    skipSiblings: {},
    skipSubtree: {}
  } as const;

  const iteratorConfig: RemoteClassConfig = {
    rpc,
    moduleId: UXP_MODULE_ID,
    methodNames: iteratorMethodNames,
    properties: {},
    methods: iteratorMethods,
    argEncoders
  };

  class WebviewXMPIterator extends RemoteClass implements XMPIterator {
    declare next: () => Promise<XMPProperty | null>;
    declare skipSiblings: () => Promise<void>;
    declare skipSubtree: () => Promise<void>;

    constructor(reference: RemoteReference) {
      super(iteratorConfig, reference);
    }
  }

  const dateTimeProperties: Readonly<Record<(typeof DATE_TIME_PROPERTY_NAMES)[number], RemotePropertyDescriptor>> =
    Object.fromEntries(
      DATE_TIME_PROPERTY_NAMES.map((name) => [name, { writable: true, mutating: false, remoteKey: name }])
    ) as Readonly<Record<(typeof DATE_TIME_PROPERTY_NAMES)[number], RemotePropertyDescriptor>>;

  const dateTimeMethodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(DATE_TIME_PROPERTY_NAMES.map((name) => [name, "xmp.dateTime.getProperty"])),
    propertySet: Object.fromEntries(DATE_TIME_PROPERTY_NAMES.map((name) => [name, "xmp.dateTime.setProperty"])),
    method: {
      compareTo: "xmp.dateTime.compareTo",
      convertToLocalTime: "xmp.dateTime.convertToLocalTime",
      convertToUTCTime: "xmp.dateTime.convertToUTCTime",
      getDate: "xmp.dateTime.getDate",
      setLocalTimeZone: "xmp.dateTime.setLocalTimeZone",
      hasDate: "xmp.dateTime.hasDate",
      hasTime: "xmp.dateTime.hasTime",
      hasTimeZone: "xmp.dateTime.hasTimeZone",
      toString: "xmp.dateTime.toString"
    },
    batchGet: "xmp.dateTime.batchGet",
    batchSet: "xmp.dateTime.batchSet",
    dispose: "xmp.dateTime.dispose"
  };

  const isoToDateDecoder: RemoteValueDecoder = (value) => (typeof value === "string" ? new Date(value) : undefined);

  const dateTimeMethods = {
    compareTo: {},
    convertToLocalTime: {},
    convertToUTCTime: {},
    getDate: { decode: isoToDateDecoder },
    setLocalTimeZone: {},
    hasDate: {},
    hasTime: {},
    hasTimeZone: {},
    toString: {}
  } as const;

  const dateTimeConfig: RemoteClassConfig = {
    rpc,
    moduleId: UXP_MODULE_ID,
    methodNames: dateTimeMethodNames,
    properties: dateTimeProperties,
    methods: dateTimeMethods,
    argEncoders
  };

  class WebviewXMPDateTime extends RemoteClass implements XMPDateTime {
    declare year: Promise<number>;
    declare month: Promise<number>;
    declare day: Promise<number>;
    declare hour: Promise<number>;
    declare minute: Promise<number>;
    declare second: Promise<number>;
    declare nanosecond: Promise<number>;
    declare tzSign: Promise<number>;
    declare tzHour: Promise<number>;
    declare tzMinute: Promise<number>;
    declare compareTo: (dateTime: XMPDateTime) => Promise<number>;
    declare convertToLocalTime: () => Promise<void>;
    declare convertToUTCTime: () => Promise<void>;
    declare getDate: () => Promise<Date>;
    declare setLocalTimeZone: () => Promise<void>;
    declare hasDate: () => Promise<boolean>;
    declare hasTime: () => Promise<boolean>;
    declare hasTimeZone: () => Promise<boolean>;
    declare toString: () => Promise<string>;

    constructor(date?: Date | string, reference?: RemoteReference) {
      super(dateTimeConfig, reference ?? dateTimeConstruction(date));
    }
  }

  function getOrCreateMeta(reference: RemoteReference): XMPMeta {
    return metaCache.getOrCreate(reference.id, () => new WebviewXMPMeta(undefined, undefined, reference));
  }

  function getOrCreateDateTime(reference: RemoteReference): XMPDateTime {
    return dateTimeCache.getOrCreate(reference.id, () => new WebviewXMPDateTime(undefined, reference));
  }

  function getOrCreateIterator(reference: RemoteReference): XMPIterator {
    return iteratorCache.getOrCreate(reference.id, () => new WebviewXMPIterator(reference));
  }

  const XMPUtilsProxy = createXMPUtils(rpc, argEncoders);

  return {
    XMPMeta: WebviewXMPMeta,
    XMPFile: WebviewXMPFile,
    XMPDateTime: WebviewXMPDateTime,
    XMPIterator: WebviewXMPIterator as unknown as { new (): never },
    XMPUtils: XMPUtilsProxy
  };
}

function metaConstruction(packet?: string, buffer?: string | number[]): RemoteConstructionRequest {
  return { method: "xmp.meta.create", args: encodeImmediateArgs([packet, buffer]) };
}

function fileConstruction(filePath?: string, format?: number, openFlags?: number): RemoteConstructionRequest {
  return { method: "xmp.file.create", args: trimTrailingUndefined([filePath, format, openFlags]) };
}

function dateTimeConstruction(date?: Date | string): RemoteConstructionRequest {
  return { method: "xmp.dateTime.create", args: encodeImmediateArgs([date]) };
}

function createXMPUtils(rpc: XmpRpc, argEncoders: readonly RemoteArgEncoder[]): XMPUtils {
  const call = <T>(method: string, args: readonly unknown[]): Promise<T> => callWithEncodedArgs<T>(rpc, method, args, argEncoders);

  return {
    appendProperties: (source, dest, options) => call<void>("xmp.utils.appendProperties", [source, dest, options]),
    catenateArrayItems: (xmpObj, schemaNS, arrayName, separator, quotes, options) =>
      call<string>("xmp.utils.catenateArrayItems", [xmpObj, schemaNS, arrayName, separator, quotes, options]),
    composeArrayItemPath: (schemaNS, arrayName, itemIndex) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeArrayItemPath", [schemaNS, arrayName, itemIndex]),
    composeFieldSelector: (schemaNS, arrayName, fieldNS, fieldName, fieldValue) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeFieldSelector", [schemaNS, arrayName, fieldNS, fieldName, fieldValue]),
    composeLangSelector: (schemaNS, arrayName, locale) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeLangSelector", [schemaNS, arrayName, locale]),
    composeStructFieldPath: (schemaNS, structName, fieldNS, fieldName) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeStructFieldPath", [schemaNS, structName, fieldNS, fieldName]),
    composeQualifierPath: (schemaNS, propName, qualNS, qualName) =>
      rpc.call<string>(UXP_MODULE_ID, "xmp.utils.composeQualifierPath", [schemaNS, propName, qualNS, qualName]),
    duplicateSubtree: (source, dest, sourceNS, sourceRoot, destNS, destRoot, options) =>
      call<void>("xmp.utils.duplicateSubtree", [source, dest, sourceNS, sourceRoot, destNS, destRoot, options]),
    removeProperties: (xmpObj, schemaNS, propName, options) =>
      call<void>("xmp.utils.removeProperties", [xmpObj, schemaNS, propName, options]),
    separateArrayItems: (xmpObj, schemaNS, arrayName, arrayOptions, concatString) =>
      call<void>("xmp.utils.separateArrayItems", [xmpObj, schemaNS, arrayName, arrayOptions, concatString])
  };
}

function deserializeProperty(
  value: XMPSerializedProperty | null | undefined,
  dateTimeValueDecoder: RemoteValueDecoder
): XMPProperty | null {
  if (!value) {
    return null;
  }

  const deserializedValue = deserializeValue(value.value, dateTimeValueDecoder);
  return {
    locale: value.locale ?? "",
    namespace: value.namespace ?? "",
    options: value.options ?? 0,
    path: value.path ?? "",
    value: deserializedValue,
    toString: () => value.stringValue ?? String(deserializedValue ?? "")
  };
}

function deserializeValue(value: XMPSerializedValue | undefined, dateTimeValueDecoder: RemoteValueDecoder): XMPValue | null {
  if (isRemoteReference(value) && value.type === "XMPDateTime") {
    return dateTimeValueDecoder(value) as XMPValue;
  }

  if (isRemoteReference(value)) {
    return null;
  }

  if (value && typeof value === "object") {
    return null;
  }

  return value ?? null;
}

async function callWithEncodedArgs<T>(
  rpc: XmpRpc,
  method: string,
  args: readonly unknown[],
  argEncoders: readonly RemoteArgEncoder[]
): Promise<T> {
  return rpc.call<T>(UXP_MODULE_ID, method, await encodeRemoteArgs(args, argEncoders));
}

function encodeImmediateArgs(args: readonly unknown[]): unknown[] {
  return trimTrailingUndefined(
    args.map((arg) => {
      if (arg instanceof Date) {
        return { kind: "uxp.xmp.nativeDate", iso: arg.toISOString() } satisfies XMPNativeDateEnvelope;
      }
      return arg;
    })
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
