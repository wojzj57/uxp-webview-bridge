import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { POINT_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsCountItem } from "./types.js";

export function createCountItemProperties(): Record<string, RemotePropertyDescriptor> {
  return {
    itemIndex: { writable: false, remoteKey: "itemIndex" },
    groupIndex: { writable: false, remoteKey: "groupIndex" },
    typename: { writable: false, remoteKey: "typename" },
    parent: { writable: false, remoteKey: "parent", collectionOf: PHOTOSHOP_REMOTE_TYPE.CountItem },
    position: { writable: false, remoteKey: "position", valueKind: POINT_VALUE_KIND }
  };
}

export function createCountItemClass(
  context: PhotoshopContext
): { new(reference: RemoteReference): PsCountItem } {
  const properties = createCountItemProperties();
  const methods = { move: { mutating: true }, remove: { mutating: true } };
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(
      Object.keys(properties).map((name) => [name, "countItem.propertyGet"])
    ),
    propertySet: {},
    method: { move: "countItem.move", remove: "countItem.remove" },
    batchGet: "countItem.batchGet",
    batchSet: "countItem.batchSet",
    dispose: "countItem.dispose"
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

  return class WebviewPsCountItem extends RemoteClass {
    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  } as unknown as { new(reference: RemoteReference): PsCountItem };
}
