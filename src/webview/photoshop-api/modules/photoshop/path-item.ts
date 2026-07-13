/** Temporary reference-capable PathItem shell; batch 2 fills the complete public surface. */

import { PHOTOSHOP_MODULE_ID } from "@shared/photoshop-api/photoshop-protocol.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodNames,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type { PsPathItem } from "./types.js";

export function createPathItemClass(context: PhotoshopContext): { new (reference: RemoteReference): PsPathItem } {
  const methodNames: RemoteMethodNames = {
    propertyGet: {},
    propertySet: {},
    method: {},
    dispose: "pathItem.dispose"
  };
  const config: RemoteClassConfig = {
    rpc: context.rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties: {},
    methods: {},
    argEncoders: [],
    decodeContext: context.registry.decodeContext
  };

  class WebviewPsPathItem extends RemoteClass implements PsPathItem {
    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  }
  return WebviewPsPathItem;
}
