import {
  PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES,
  PHOTOSHOP_PREFERENCE_ROOT_PROPERTIES,
  type PhotoshopPreferenceCategoryType
} from "@shared/photoshop-api/photoshop-preferences.js";
import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { RemoteClass, type RemoteClassConfig, type RemoteMethodNames, type RemotePropertyDescriptor, type RemoteReference } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { Preferences } from "./types.js";

export function createPreferenceProperties(remoteType: string): Record<string, RemotePropertyDescriptor> {
  if (remoteType === PHOTOSHOP_REMOTE_TYPE.Preferences) {
    return {
      typename: { writable: false, remoteKey: "typename" },
      ...Object.fromEntries(Object.entries(PHOTOSHOP_PREFERENCE_ROOT_PROPERTIES).map(([name, refType]) => [name, { writable: false, remoteKey: name, refType }]))
    };
  }
  const names = PHOTOSHOP_PREFERENCE_CATEGORY_PROPERTIES[remoteType as PhotoshopPreferenceCategoryType];
  if (!names) throw new Error(`Unknown preference remote type: ${remoteType}`);
  return {
    typename: { writable: false, remoteKey: "typename" },
    ...Object.fromEntries(names.map((name) => [name, { writable: true, remoteKey: name }]))
  };
}

export function createPreferenceClass<T extends object>(
  context: PhotoshopContext,
  remoteType: string
): { new(reference: RemoteReference): T } {
  const properties = createPreferenceProperties(remoteType);
  const writable = Object.entries(properties).filter(([, descriptor]) => descriptor.writable).map(([name]) => name);
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "preferences.propertyGet"])),
    propertySet: Object.fromEntries(writable.map((name) => [name, "preferences.propertySet"])),
    method: {}, batchGet: "preferences.batchGet", batchSet: "preferences.batchSet", dispose: "preferences.dispose"
  };
  const config: RemoteClassConfig = { rpc: context.rpc, moduleId: PHOTOSHOP_MODULE_ID, properties, methods: {}, methodNames, argEncoders: context.argEncoders, decodeContext: context.registry.decodeContext };
  return class WebviewPreference extends RemoteClass { constructor(reference: RemoteReference) { super(config, reference); } } as unknown as { new(reference: RemoteReference): T };
}

export function createPreferencesClass(context: PhotoshopContext): { new(reference: RemoteReference): Preferences } {
  return createPreferenceClass<Preferences>(context, PHOTOSHOP_REMOTE_TYPE.Preferences);
}
