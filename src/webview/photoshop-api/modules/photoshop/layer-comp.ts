import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsLayerComp } from "./types.js";

const SCALARS = [
  "typename",
  "id",
  "docId",
  "name",
  "comment",
  "selected",
  "appearance",
  "position",
  "visibility",
  "childComp"
] as const;
const WRITABLE = new Set(["name", "comment", "appearance", "position", "visibility", "childComp"]);

export function createLayerCompProperties(): Record<string, RemotePropertyDescriptor> {
  const properties: Record<string, RemotePropertyDescriptor> = Object.fromEntries(
    SCALARS.map((name) => [
      name,
      { writable: WRITABLE.has(name), mutating: WRITABLE.has(name), remoteKey: name }
    ])
  );
  properties.parent = { writable: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.Document };
  return properties;
}

export function createLayerCompClass(
  context: PhotoshopContext
): { new(reference: RemoteReference): PsLayerComp } {
  const properties = createLayerCompProperties();
  const methods = {
    apply: { mutating: true },
    duplicate: { mutating: true, refType: PHOTOSHOP_REMOTE_TYPE.LayerComp },
    recapture: { mutating: true },
    remove: { mutating: true },
    resetLayerComp: { mutating: true }
  };
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(
      Object.keys(properties).map((name) => [name, "layerComp.propertyGet"])
    ),
    propertySet: Object.fromEntries([...WRITABLE].map((name) => [name, "layerComp.propertySet"])),
    method: Object.fromEntries(Object.keys(methods).map((name) => [name, `layerComp.${name}`])),
    batchGet: "layerComp.batchGet",
    batchSet: "layerComp.batchSet",
    dispose: "layerComp.dispose"
  };
  const config: RemoteClassConfig = {
    rpc: context.rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    properties,
    methods,
    methodNames,
    argEncoders: context.argEncoders,
    decodeContext: context.registry.decodeContext
  };

  return class WebviewPsLayerComp extends RemoteClass {
    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  } as unknown as { new(reference: RemoteReference): PsLayerComp };
}
