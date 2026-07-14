import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodDescriptor, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsDocument, PsLayer, PsPathItem, SolidColorInput, SubPathItems, SelectionPoint } from "./types.js";
import type { ColorBlendModeValue, PathKindValue, SelectionTypeValue, ToolTypeValue } from "@shared/photoshop-api/photoshop-constants.js";

const SCALARS = ["typename", "id", "docId", "kind", "name"] as const;
const METHODS = ["deselect", "duplicate", "fillPath", "makeClippingPath", "makeSelection", "remove", "select", "strokePath"] as const;
export function createPathItemProperties(): Record<string, RemotePropertyDescriptor> {
  const result: Record<string, RemotePropertyDescriptor> = Object.fromEntries(SCALARS.map((name) => [name, { writable: name === "kind" || name === "name", mutating: name === "kind" || name === "name", remoteKey: name }]));
  result.parent = { writable: false, mutating: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.Document };
  result.subPathItems = { writable: false, mutating: false, remoteKey: "subPathItems", collectionOf: PHOTOSHOP_REMOTE_TYPE.SubPathItem };
  return result;
}
export function createPathItemMethods(): Record<string, RemoteMethodDescriptor> {
  const result: Record<string, RemoteMethodDescriptor> = Object.fromEntries(METHODS.map((name) => [name, { mutating: true }]));
  result.duplicate = { mutating: true, refType: PHOTOSHOP_REMOTE_TYPE.PathItem };
  return result;
}
export function createPathItemClass(context: PhotoshopContext): { new(reference: RemoteReference): PsPathItem } {
  const properties = createPathItemProperties();
  const config: RemoteClassConfig = { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: createPathItemMethods(), argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext, methodNames: {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "pathItem.propertyGet"])),
    propertySet: { kind: "pathItem.propertySet", name: "pathItem.propertySet" },
    method: Object.fromEntries(METHODS.map((name) => [name, `pathItem.${name}`])),
    batchGet: "pathItem.batchGet", batchSet: "pathItem.batchSet", dispose: "pathItem.dispose"
  } satisfies RemoteMethodNames };
  class WebviewPsPathItem extends RemoteClass implements PsPathItem {
    declare readonly typename: Promise<"PathItem">; declare readonly id: Promise<number>; declare readonly docId: Promise<number>;
    declare readonly parent: Promise<PsDocument>; declare kind: Promise<PathKindValue>; declare name: Promise<string>; declare readonly subPathItems: Promise<SubPathItems>;
    declare deselect: () => Promise<void>; declare duplicate: (name?: string) => Promise<PsPathItem>;
    declare fillPath: (fillColor?: SolidColorInput, mode?: ColorBlendModeValue, opacity?: number, preserveTransparency?: boolean, feather?: number, wholePath?: boolean, antiAlias?: boolean) => Promise<void>;
    declare makeClippingPath: (flatness?: number) => Promise<void>; declare makeSelection: (feather?: number, antiAlias?: boolean, operation?: SelectionTypeValue) => Promise<void>;
    declare remove: () => Promise<void>; declare select: () => Promise<void>;
    declare strokePath: (tool?: ToolTypeValue, simulatePressure?: boolean, sourceOrigin?: SelectionPoint, sourceLayer?: PsLayer) => Promise<void>;
    constructor(reference: RemoteReference) { super(config, reference); }
  }
  return WebviewPsPathItem;
}
