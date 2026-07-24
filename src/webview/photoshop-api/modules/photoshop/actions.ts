import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodDescriptor, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { Action, ActionSet } from "./types.js";

export function createActionSetProperties(): Record<string, RemotePropertyDescriptor> {
  return {
    typename: { writable: false, remoteKey: "typename" }, index: { writable: false, remoteKey: "index" },
    id: { writable: false, remoteKey: "id" }, name: { writable: true, remoteKey: "name" },
    actions: { writable: false, remoteKey: "actions", collectionOf: PHOTOSHOP_REMOTE_TYPE.Action }
  };
}
export function createActionProperties(): Record<string, RemotePropertyDescriptor> {
  return {
    typename: { writable: false, remoteKey: "typename" }, id: { writable: false, remoteKey: "id" },
    index: { writable: false, remoteKey: "index" }, name: { writable: true, remoteKey: "name" },
    parent: { writable: false, remoteKey: "parent", refType: PHOTOSHOP_REMOTE_TYPE.ActionSet }
  };
}
const methods = (duplicateType: string): Record<string, RemoteMethodDescriptor> => ({ delete: {}, duplicate: { refType: duplicateType }, play: {} });

function configFor(context: PhotoshopContext, prefix: "actionSet" | "actionObject", properties: Record<string, RemotePropertyDescriptor>, duplicateType: string): RemoteClassConfig {
  const methodDescriptors = methods(duplicateType);
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, `${prefix}.propertyGet`])),
    propertySet: { name: `${prefix}.propertySet` },
    method: Object.fromEntries(Object.keys(methodDescriptors).map((name) => [name, `${prefix}.${name}`])),
    batchGet: `${prefix}.batchGet`, batchSet: `${prefix}.batchSet`, dispose: `${prefix}.dispose`
  };
  return { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: methodDescriptors, methodNames, argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext };
}
export function createActionSetClass(context: PhotoshopContext): { new(reference: RemoteReference): ActionSet } {
  const config = configFor(context, "actionSet", createActionSetProperties(), PHOTOSHOP_REMOTE_TYPE.ActionSet);
  return class WebviewActionSet extends RemoteClass { constructor(reference: RemoteReference) { super(config, reference); } } as unknown as { new(reference: RemoteReference): ActionSet };
}
export function createActionClass(context: PhotoshopContext): { new(reference: RemoteReference): Action } {
  const config = configFor(context, "actionObject", createActionProperties(), PHOTOSHOP_REMOTE_TYPE.Action);
  return class WebviewAction extends RemoteClass { constructor(reference: RemoteReference) { super(config, reference); } } as unknown as { new(reference: RemoteReference): Action };
}
