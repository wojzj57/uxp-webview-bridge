import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import type { DirectionValue } from "@shared/photoshop-api/photoshop-constants.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsDocument, PsGuide } from "./types.js";
const SCALARS = ["typename", "id", "docId", "direction", "coordinate"] as const;
export function createGuideProperties(): Record<string, RemotePropertyDescriptor> {
  const result: Record<string, RemotePropertyDescriptor> = Object.fromEntries(SCALARS.map((name) => [name, { writable: name === "direction" || name === "coordinate", mutating: name === "direction" || name === "coordinate", remoteKey: name }]));
  result.parent = { writable: false, mutating: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.Document }; return result;
}
export function createGuideClass(context: PhotoshopContext): { new(reference: RemoteReference): PsGuide } {
  const properties = createGuideProperties();
  const config: RemoteClassConfig = { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: { delete: { mutating: true } }, argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext, methodNames: {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "guide.propertyGet"])), propertySet: { direction: "guide.propertySet", coordinate: "guide.propertySet" }, method: { delete: "guide.delete" }, batchGet: "guide.batchGet", batchSet: "guide.batchSet", dispose: "guide.dispose"
  } satisfies RemoteMethodNames };
  class WebviewPsGuide extends RemoteClass implements PsGuide {
    declare readonly typename: Promise<"Guide">; declare readonly id: Promise<number>; declare readonly docId: Promise<number>; declare readonly parent: Promise<PsDocument>; declare direction: Promise<DirectionValue>; declare coordinate: Promise<number>; declare delete: () => Promise<void>;
    constructor(reference: RemoteReference) { super(config, reference); }
  } return WebviewPsGuide;
}
