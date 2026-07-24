import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { SOLID_COLOR_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import { SolidColor } from "./solid-color.js";
import { PathPointInfo, SubPathInfo } from "./path-builders.js";
import type { PhotoshopContext } from "./context.js";
import type { PhotoshopApp } from "./types.js";

const APP_WRITABLE = ["displayDialogs", "activeDocument", "foregroundColor", "backgroundColor"] as const;

export function createAppProperties(): Record<string, RemotePropertyDescriptor> {
  const T = PHOTOSHOP_REMOTE_TYPE;
  return {
    typename: { writable: false, remoteKey: "typename" },
    preferences: { writable: false, remoteKey: "preferences", refType: T.Preferences },
    displayDialogs: { writable: true, remoteKey: "displayDialogs" },
    activeDocument: { writable: true, remoteKey: "activeDocument", refType: T.Document },
    currentTool: { writable: false, remoteKey: "currentTool", refType: T.Tool },
    actionTree: { writable: false, remoteKey: "actionTree", collectionOf: T.ActionSet },
    documents: { writable: false, remoteKey: "documents", collectionOf: T.Document },
    foregroundColor: { writable: true, remoteKey: "foregroundColor", valueKind: SOLID_COLOR_VALUE_KIND },
    backgroundColor: { writable: true, remoteKey: "backgroundColor", valueKind: SOLID_COLOR_VALUE_KIND },
    fonts: { writable: false, remoteKey: "fonts", collectionOf: T.TextFont }
  };
}

export function createAppMethods(): Record<string, RemoteMethodDescriptor> {
  return {
    getColorProfiles: {},
    convertUnits: {},
    showAlert: {},
    batchPlay: {},
    bringToFront: {},
    open: { refType: PHOTOSHOP_REMOTE_TYPE.Document },
    createDocument: { refType: PHOTOSHOP_REMOTE_TYPE.Document },
    updateUI: {}
  };
}

export function createPhotoshopAppClass(context: PhotoshopContext): {
  new (source: RemoteReference | { readonly method: string; readonly args: readonly unknown[] }): PhotoshopApp;
} {
  const properties = createAppProperties();
  const methods = createAppMethods();
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "app.propertyGet"])),
    propertySet: Object.fromEntries(APP_WRITABLE.map((name) => [name, "app.propertySet"])),
    method: Object.fromEntries(Object.keys(methods).map((name) => [name, `app.${name}`])),
    batchGet: "app.batchGet",
    batchSet: "app.batchSet",
    dispose: "app.dispose"
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

  class WebviewPhotoshopApp extends RemoteClass {
    readonly SolidColor = SolidColor;
    readonly PathPointInfo = PathPointInfo;
    readonly SubPathInfo = SubPathInfo;
    constructor(source: RemoteReference | { readonly method: string; readonly args: readonly unknown[] }) {
      super(config, source);
    }
  }
  return WebviewPhotoshopApp as unknown as {
    new (source: RemoteReference | { readonly method: string; readonly args: readonly unknown[] }): PhotoshopApp;
  };
}
