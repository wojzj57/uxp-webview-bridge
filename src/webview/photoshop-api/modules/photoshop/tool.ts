import { PHOTOSHOP_MODULE_ID } from "@shared/photoshop-api/photoshop-protocol.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { Tool } from "./types.js";

export function createToolProperties(): Record<string, RemotePropertyDescriptor> {
  return { id: { writable: true, remoteKey: "id" }, typename: { writable: false, remoteKey: "typename" } };
}
export function createToolClass(context: PhotoshopContext): { new(reference: RemoteReference): Tool } {
  const properties = createToolProperties();
  const methodNames: RemoteMethodNames = { propertyGet: { id: "tool.propertyGet", typename: "tool.propertyGet" }, propertySet: { id: "tool.propertySet" }, method: {}, batchGet: "tool.batchGet", batchSet: "tool.batchSet", dispose: "tool.dispose" };
  const config: RemoteClassConfig = { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: {}, methodNames, argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext };
  return class WebviewTool extends RemoteClass { constructor(reference: RemoteReference) { super(config, reference); } } as unknown as { new(reference: RemoteReference): Tool };
}
