import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { TextFont } from "./types.js";

export function createTextFontProperties(): Record<string, RemotePropertyDescriptor> {
  const properties = Object.fromEntries(
    ["family", "name", "postScriptName", "style", "typename"].map((name) => [name, { writable: false, remoteKey: name }])
  ) as Record<string, RemotePropertyDescriptor>;
  properties.parent = { writable: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.Photoshop };
  return properties;
}

export function createTextFontClass(context: PhotoshopContext): { new(reference: RemoteReference): TextFont } {
  const properties = createTextFontProperties();
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "textFont.propertyGet"])),
    propertySet: {}, method: {}, batchGet: "textFont.batchGet", batchSet: "textFont.batchSet", dispose: "textFont.dispose"
  };
  const config: RemoteClassConfig = { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: {}, methodNames, argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext };
  return class WebviewTextFont extends RemoteClass { constructor(reference: RemoteReference) { super(config, reference); } } as unknown as { new(reference: RemoteReference): TextFont };
}
