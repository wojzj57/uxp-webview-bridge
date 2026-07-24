import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { POINT_VALUE_KIND, SAMPLED_COLOR_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsColorSampler } from "./types.js";

export function createColorSamplerProperties(): Record<string, RemotePropertyDescriptor> {
  return {
    typename: { writable: false, remoteKey: "typename" },
    docId: { writable: false, remoteKey: "docId" },
    parent: { writable: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.Document },
    position: { writable: false, remoteKey: "position", valueKind: POINT_VALUE_KIND },
    color: { writable: false, remoteKey: "color", valueKind: SAMPLED_COLOR_VALUE_KIND }
  };
}

export function createColorSamplerClass(
  context: PhotoshopContext
): { new(reference: RemoteReference): PsColorSampler } {
  const properties = createColorSamplerProperties();
  const methods = { move: { mutating: true }, remove: { mutating: true } };
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(
      Object.keys(properties).map((name) => [name, "colorSampler.propertyGet"])
    ),
    propertySet: {},
    method: { move: "colorSampler.move", remove: "colorSampler.remove" },
    batchGet: "colorSampler.batchGet",
    batchSet: "colorSampler.batchSet",
    dispose: "colorSampler.dispose"
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

  return class WebviewPsColorSampler extends RemoteClass {
    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  } as unknown as { new(reference: RemoteReference): PsColorSampler };
}
