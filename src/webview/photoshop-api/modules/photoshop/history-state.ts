/** WebView RemoteObject for a stable Photoshop HistoryState. */

import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsDocument, PsHistoryState } from "./types.js";

const HISTORY_STATE_SCALARS = ["typename", "id", "docId", "name", "snapshot"] as const;

export function createHistoryStateProperties(): Record<string, RemotePropertyDescriptor> {
  const properties: Record<string, RemotePropertyDescriptor> = Object.fromEntries(
    HISTORY_STATE_SCALARS.map((name) => [name, { writable: false, mutating: false, remoteKey: name }])
  );
  properties.parent = {
    writable: false,
    mutating: false,
    remoteKey: "parent",
    refType: PHOTOSHOP_REMOTE_TYPE.Document
  };
  return properties;
}

export function createHistoryStateClass(
  context: PhotoshopContext
): { new (reference: RemoteReference): PsHistoryState } {
  const properties = createHistoryStateProperties();
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "historyState.propertyGet"])),
    propertySet: {},
    method: {},
    batchGet: "historyState.batchGet",
    batchSet: "historyState.batchSet",
    dispose: "historyState.dispose"
  };
  const config: RemoteClassConfig = {
    rpc: context.rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods: {},
    argEncoders: context.argEncoders,
    decodeContext: context.registry.decodeContext
  };

  class WebviewPsHistoryState extends RemoteClass implements PsHistoryState {
    declare readonly typename: Promise<"HistoryState">;
    declare readonly id: Promise<number>;
    declare readonly docId: Promise<number>;
    declare readonly name: Promise<string>;
    declare readonly parent: PsHistoryState["parent"];
    declare readonly snapshot: Promise<boolean>;

    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  }

  return WebviewPsHistoryState;
}
