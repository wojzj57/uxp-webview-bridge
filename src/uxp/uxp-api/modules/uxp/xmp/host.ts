import type { UxpXmpHostModule, UxpXmpMethodName, XMPNativeDateEnvelope, XMPRemoteReference, XMPSerializedProperty } from "./types.js";

declare const require: (moduleName: "uxp") => UxpXmpHostModule;

interface XmpHandle {
  readonly type: XMPRemoteReference["type"];
  readonly value: unknown;
  readonly touchedAt: number;
}

type XmpApi = UxpXmpHostModule["xmp"];

const HANDLES = new Map<string, XmpHandle>();
const HANDLE_TTL_MS = 10 * 60 * 1000;
let nextHandleId = 1;

const META_INSTANCE_METHODS = {
  "xmp.meta.appendArrayItem": { name: "appendArrayItem", min: 3, max: 5 },
  "xmp.meta.countArrayItems": { name: "countArrayItems", min: 2, max: 2 },
  "xmp.meta.deleteArrayItem": { name: "deleteArrayItem", min: 3, max: 3 },
  "xmp.meta.deleteProperty": { name: "deleteProperty", min: 2, max: 2 },
  "xmp.meta.deleteStructField": { name: "deleteStructField", min: 4, max: 4 },
  "xmp.meta.deleteQualifier": { name: "deleteQualifier", min: 4, max: 4 },
  "xmp.meta.doesArrayItemExist": { name: "doesArrayItemExist", min: 3, max: 3 },
  "xmp.meta.doesPropertyExist": { name: "doesPropertyExist", min: 2, max: 2 },
  "xmp.meta.doesStructFieldExist": { name: "doesStructFieldExist", min: 4, max: 4 },
  "xmp.meta.doesQualifierExist": { name: "doesQualifierExist", min: 4, max: 4 },
  "xmp.meta.dumpObject": { name: "dumpObject", min: 0, max: 0 },
  "xmp.meta.getArrayItem": { name: "getArrayItem", min: 3, max: 3, property: true },
  "xmp.meta.getLocalizedText": { name: "getLocalizedText", min: 4, max: 4, property: true },
  "xmp.meta.getProperty": { name: "getProperty", min: 2, max: 3, property: true },
  "xmp.meta.getStructField": { name: "getStructField", min: 4, max: 4, property: true },
  "xmp.meta.getQualifier": { name: "getQualifier", min: 4, max: 4, property: true },
  "xmp.meta.insertArrayItem": { name: "insertArrayItem", min: 4, max: 5 },
  "xmp.meta.serialize": { name: "serialize", min: 0, max: 5 },
  "xmp.meta.serializeToArray": { name: "serializeToArray", min: 0, max: 5 },
  "xmp.meta.setArrayItem": { name: "setArrayItem", min: 4, max: 5 },
  "xmp.meta.setLocalizedText": { name: "setLocalizedText", min: 5, max: 6 },
  "xmp.meta.setStructField": { name: "setStructField", min: 5, max: 6 },
  "xmp.meta.setQualifier": { name: "setQualifier", min: 5, max: 6 },
  "xmp.meta.setProperty": { name: "setProperty", min: 3, max: 5 },
  "xmp.meta.sort": { name: "sort", min: 0, max: 0 }
} as const;

const META_STATIC_METHODS = {
  "xmp.meta.deleteNamespace": { name: "deleteNamespace", min: 1, max: 1 },
  "xmp.meta.dumpNamespaces": { name: "dumpNamespaces", min: 0, max: 0 },
  "xmp.meta.getNamespacePrefix": { name: "getNamespacePrefix", min: 1, max: 1 },
  "xmp.meta.getNamespaceURI": { name: "getNamespaceURI", min: 1, max: 1 },
  "xmp.meta.registerNamespace": { name: "registerNamespace", min: 2, max: 2 }
} as const;

const UTILS_METHODS = {
  "xmp.utils.appendProperties": { name: "appendProperties", min: 2, max: 3 },
  "xmp.utils.catenateArrayItems": { name: "catenateArrayItems", min: 3, max: 6 },
  "xmp.utils.composeArrayItemPath": { name: "composeArrayItemPath", min: 3, max: 3 },
  "xmp.utils.composeFieldSelector": { name: "composeFieldSelector", min: 5, max: 5 },
  "xmp.utils.composeLangSelector": { name: "composeLangSelector", min: 3, max: 3 },
  "xmp.utils.composeStructFieldPath": { name: "composeStructFieldPath", min: 4, max: 4 },
  "xmp.utils.composeQualifierPath": { name: "composeQualifierPath", min: 4, max: 4 },
  "xmp.utils.duplicateSubtree": { name: "duplicateSubtree", min: 5, max: 7 },
  "xmp.utils.removeProperties": { name: "removeProperties", min: 1, max: 4 },
  "xmp.utils.separateArrayItems": { name: "separateArrayItems", min: 5, max: 5 }
} as const;

const DATE_TIME_METHODS = {
  "xmp.dateTime.compareTo": { name: "compareTo", min: 1, max: 1 },
  "xmp.dateTime.convertToLocalTime": { name: "convertToLocalTime", min: 0, max: 0 },
  "xmp.dateTime.convertToUTCTime": { name: "convertToUTCTime", min: 0, max: 0 },
  "xmp.dateTime.setLocalTimeZone": { name: "setLocalTimeZone", min: 0, max: 0 },
  "xmp.dateTime.hasDate": { name: "hasDate", min: 0, max: 0 },
  "xmp.dateTime.hasTime": { name: "hasTime", min: 0, max: 0 },
  "xmp.dateTime.hasTimeZone": { name: "hasTimeZone", min: 0, max: 0 },
  "xmp.dateTime.toString": { name: "toString", min: 0, max: 0 }
} as const;

export function dispatchUxpXmpCall(method: UxpXmpMethodName, args: readonly unknown[]): unknown {
  pruneExpiredHandles();

  if (method === "xmp.meta.create") {
    expectArgs(args, 0, 2, method);
    const xmp = getXmpApi();
    const [packet, buffer] = decodeArgs(args);
    return createHandle("XMPMeta", packet === undefined ? new xmp.XMPMeta() : new xmp.XMPMeta(packet as string, buffer as string | number[]));
  }

  if (method === "xmp.file.create") {
    expectArgs(args, 0, 3, method);
    const xmp = getXmpApi();
    const [filePath, format, openFlags] = args;
    return createHandle(
      "XMPFile",
      filePath === undefined
        ? new xmp.XMPFile()
        : new xmp.XMPFile(filePath as string, format as number, openFlags as number)
    );
  }

  if (method === "xmp.dateTime.create") {
    expectArgs(args, 0, 1, method);
    const xmp = getXmpApi();
    const [date] = decodeArgs(args);
    return createHandle("XMPDateTime", date === undefined ? new xmp.XMPDateTime() : new xmp.XMPDateTime(date as Date | string));
  }

  if (method === "xmp.meta.dispose" || method === "xmp.file.dispose" || method === "xmp.iterator.dispose" || method === "xmp.dateTime.dispose") {
    const [reference] = expectReferenceArgs(args, 1, 1, method);
    disposeHandle(reference);
    return undefined;
  }

  if (method === "xmp.meta.iterator") {
    const [reference, ...methodArgs] = expectReferenceArgs(args, 1, 4, method);
    const meta = getHandleValue(reference, "XMPMeta");
    return createHandle("XMPIterator", callMethod(meta, "iterator", decodeArgs(methodArgs)));
  }

  if (method in META_INSTANCE_METHODS) {
    const spec = META_INSTANCE_METHODS[method as keyof typeof META_INSTANCE_METHODS];
    const [reference, ...methodArgs] = expectReferenceArgs(args, spec.min + 1, spec.max + 1, method);
    const meta = getHandleValue(reference, "XMPMeta");
    const result = callMethod(meta, spec.name, decodeArgs(methodArgs));
    if (method === "xmp.meta.serializeToArray") {
      return serializeNumberArray(result);
    }
    return "property" in spec ? serializeProperty(result, getXmpApi()) : result;
  }

  if (method in META_STATIC_METHODS) {
    const spec = META_STATIC_METHODS[method as keyof typeof META_STATIC_METHODS];
    expectArgs(args, spec.min, spec.max, method);
    return callMethod(getXmpApi().XMPMeta, spec.name, decodeArgs(args));
  }

  if (method === "xmp.file.getFormatInfo") {
    expectArgs(args, 1, 1, method);
    return getXmpApi().XMPFile.getFormatInfo(args[0] as number);
  }

  if (method.startsWith("xmp.file.")) {
    return dispatchFileMethod(method, args);
  }

  if (method.startsWith("xmp.iterator.")) {
    return dispatchIteratorMethod(method, args);
  }

  if (method.startsWith("xmp.dateTime.")) {
    return dispatchDateTimeMethod(method, args);
  }

  if (method in UTILS_METHODS) {
    const spec = UTILS_METHODS[method as keyof typeof UTILS_METHODS];
    expectArgs(args, spec.min, spec.max, method);
    return callMethod(getXmpApi().XMPUtils, spec.name, decodeArgs(args));
  }

  throw new Error(`Unsupported uxp xmp method: ${method}`);
}

export function destroyUxpXmpHandles(): void {
  HANDLES.clear();
}

function dispatchFileMethod(method: UxpXmpMethodName, args: readonly unknown[]): unknown {
  const [reference, ...methodArgs] = expectReferenceArgs(args, 1, 3, method);
  const file = getHandleValue(reference, "XMPFile");

  switch (method) {
    case "xmp.file.canPutXMP":
      expectArgs(methodArgs, 1, 1, method);
      return callMethod(file, "canPutXMP", decodeArgs(methodArgs));
    case "xmp.file.closeFile":
      expectArgs(methodArgs, 1, 1, method);
      return callMethod(file, "closeFile", methodArgs);
    case "xmp.file.getXMP":
      expectArgs(methodArgs, 0, 0, method);
      return createHandle("XMPMeta", callMethod(file, "getXMP", []));
    case "xmp.file.getPacketInfo":
      expectArgs(methodArgs, 0, 0, method);
      return copyKnownProperties(callMethod(file, "getPacketInfo", []), ["charForm", "length", "offset", "packet", "padSize", "writeable"]);
    case "xmp.file.getFileInfo":
      expectArgs(methodArgs, 0, 0, method);
      return copyKnownProperties(callMethod(file, "getFileInfo", []), ["filePath", "format", "handlerFlags", "openFlags"]);
    case "xmp.file.putXMP":
      expectArgs(methodArgs, 1, 1, method);
      return callMethod(file, "putXMP", decodeArgs(methodArgs));
    default:
      throw new Error(`Unsupported uxp xmp file method: ${method}`);
  }
}

function dispatchIteratorMethod(method: UxpXmpMethodName, args: readonly unknown[]): unknown {
  const [reference, ...methodArgs] = expectReferenceArgs(args, 1, 1, method);
  const iterator = getHandleValue(reference, "XMPIterator");

  switch (method) {
    case "xmp.iterator.next":
      expectArgs(methodArgs, 0, 0, method);
      return serializeProperty(callMethod(iterator, "next", []), getXmpApi());
    case "xmp.iterator.skipSiblings":
      expectArgs(methodArgs, 0, 0, method);
      return callMethod(iterator, "skipSiblings", []);
    case "xmp.iterator.skipSubtree":
      expectArgs(methodArgs, 0, 0, method);
      return callMethod(iterator, "skipSubtree", []);
    default:
      throw new Error(`Unsupported uxp xmp iterator method: ${method}`);
  }
}

function dispatchDateTimeMethod(method: UxpXmpMethodName, args: readonly unknown[]): unknown {
  if (method === "xmp.dateTime.getProperty") {
    const [reference, property] = expectReferenceArgs(args, 2, 2, method);
    assertNonEmptyString(property, `${method} property`);
    return (getHandleValue(reference, "XMPDateTime") as Record<string, unknown>)[property];
  }

  if (method === "xmp.dateTime.setProperty") {
    const [reference, property, value] = expectReferenceArgs(args, 3, 3, method);
    assertNonEmptyString(property, `${method} property`);
    (getHandleValue(reference, "XMPDateTime") as Record<string, unknown>)[property] = value;
    return undefined;
  }

  if (method === "xmp.dateTime.getDate") {
    const [reference, ...methodArgs] = expectReferenceArgs(args, 1, 1, method);
    expectArgs(methodArgs, 0, 0, method);
    const result = callMethod(getHandleValue(reference, "XMPDateTime"), "getDate", []);
    return result instanceof Date ? result.toISOString() : new Date(result as string | number).toISOString();
  }

  if (method in DATE_TIME_METHODS) {
    const spec = DATE_TIME_METHODS[method as keyof typeof DATE_TIME_METHODS];
    const [reference, ...methodArgs] = expectReferenceArgs(args, spec.min + 1, spec.max + 1, method);
    return callMethod(getHandleValue(reference, "XMPDateTime"), spec.name, decodeArgs(methodArgs));
  }

  throw new Error(`Unsupported uxp xmp dateTime method: ${method}`);
}

function serializeProperty(value: unknown, xmp: XmpApi): XMPSerializedProperty | null {
  if (!value) {
    return null;
  }

  const property = value as Record<string, unknown>;
  const result: {
    locale?: string;
    namespace?: string;
    options?: number;
    path?: string;
    value?: string | number | boolean | XMPRemoteReference | null;
    stringValue?: string;
  } = {
    value: serializePropertyValue(property.value, xmp),
  };

  if (typeof property.locale === "string") {
    result.locale = property.locale;
  }
  if (typeof property.namespace === "string") {
    result.namespace = property.namespace;
  }
  if (typeof property.options === "number") {
    result.options = property.options;
  }
  if (typeof property.path === "string") {
    result.path = property.path;
  }
  if (typeof property.toString === "function") {
    result.stringValue = String(property.toString());
  }

  return result;
}

function serializePropertyValue(value: unknown, xmp: XmpApi): string | number | boolean | XMPRemoteReference | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof xmp.XMPDateTime) {
    return createHandle("XMPDateTime", value);
  }

  return value == null ? null : String(value);
}

function createHandle(type: XMPRemoteReference["type"], value: unknown): XMPRemoteReference {
  const id = `${type}:${Date.now()}:${nextHandleId++}`;
  HANDLES.set(id, { type, value, touchedAt: Date.now() });
  return { kind: "uxp.xmp.ref", type, id };
}

function disposeHandle(reference: XMPRemoteReference): void {
  HANDLES.delete(reference.id);
}

function getHandleValue(reference: XMPRemoteReference, expectedType: XMPRemoteReference["type"]): unknown {
  if (reference.kind !== "uxp.xmp.ref" || reference.type !== expectedType || typeof reference.id !== "string") {
    throw new Error(`Invalid ${expectedType} reference.`);
  }

  const handle = HANDLES.get(reference.id);
  if (!handle || handle.type !== expectedType) {
    throw new Error(`Unknown ${expectedType} reference: ${reference.id}`);
  }

  HANDLES.set(reference.id, { ...handle, touchedAt: Date.now() });
  return handle.value;
}

function pruneExpiredHandles(): void {
  const now = Date.now();
  for (const [id, handle] of HANDLES) {
    if (now - handle.touchedAt > HANDLE_TTL_MS) {
      HANDLES.delete(id);
    }
  }
}

function decodeArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => decodeValue(arg));
}

function decodeValue(value: unknown): unknown {
  if (isReference(value)) {
    return getHandleValue(value, value.type);
  }

  if (isNativeDateEnvelope(value)) {
    return new Date(value.iso);
  }

  if (Array.isArray(value)) {
    return value.map((item) => decodeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeValue(nested)]));
  }

  return value;
}

function isReference(value: unknown): value is XMPRemoteReference {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "uxp.xmp.ref" &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function isNativeDateEnvelope(value: unknown): value is XMPNativeDateEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "uxp.xmp.nativeDate" &&
    typeof (value as { iso?: unknown }).iso === "string"
  );
}

function callMethod(target: unknown, methodName: string, args: readonly unknown[]): unknown {
  const method = (target as Record<string, unknown>)[methodName];
  if (typeof method !== "function") {
    throw new Error(`uxp.xmp target does not implement ${methodName}.`);
  }
  return method.apply(target, args);
}

function copyKnownProperties(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function serializeNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item));
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>, (item) => Number(item));
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  throw new Error("uxp.xmp.XMPMeta.serializeToArray returned a non-array value.");
}

function expectReferenceArgs(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): [XMPRemoteReference, ...unknown[]] {
  expectArgs(args, minLength, maxLength, method);
  const reference = args[0];
  if (!isReference(reference)) {
    throw new Error(`${method} requires an XMP remote reference as its first argument.`);
  }
  return args as [XMPRemoteReference, ...unknown[]];
}

function expectArgs(args: readonly unknown[], minLength: number, maxLength: number, method: string): void {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function getXmpApi(): XmpApi {
  return require("uxp").xmp;
}
