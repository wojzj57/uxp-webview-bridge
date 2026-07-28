/** WebView RemoteObject for Photoshop's document-owned pixel Selection. */

import type {
  AnchorPositionValue,
  InterpolationMethodValue,
  SelectionTypeValue
} from "@shared/photoshop-api/photoshop-constants.js";
import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { IMAGING_BOUNDS_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { PhotoshopContext } from "./context.js";
import type {
  ImagingBounds,
  PsChannel,
  PsDocument,
  PsLayer,
  PsPathItem,
  PsSelection,
  SelectionBounds,
  SelectionPoint
} from "./types.js";

const SELECTION_SCALARS = ["typename", "docId", "solid"] as const;
const SELECTION_METHODS = [
  "contract",
  "deselect",
  "expand",
  "feather",
  "grow",
  "inverse",
  "load",
  "makeWorkPath",
  "selectAll",
  "selectRectangle",
  "selectEllipse",
  "selectPolygon",
  "selectRow",
  "selectColumn",
  "save",
  "saveTo",
  "selectBorder",
  "smooth",
  "translateBoundary",
  "resizeBoundary",
  "rotateBoundary"
] as const;

export function createSelectionProperties(): Record<string, RemotePropertyDescriptor> {
  const properties: Record<string, RemotePropertyDescriptor> = Object.fromEntries(
    SELECTION_SCALARS.map((name) => [name, { writable: false, mutating: false, remoteKey: name }])
  );
  properties.parent = {
    writable: false,
    mutating: false,
    remoteKey: "parent",
    refType: PHOTOSHOP_REMOTE_TYPE.Document
  };
  properties.bounds = {
    writable: false,
    mutating: false,
    remoteKey: "bounds",
    valueKind: IMAGING_BOUNDS_VALUE_KIND
  };
  return properties;
}

export function createSelectionMethods(): Record<string, RemoteMethodDescriptor> {
  const methods: Record<string, RemoteMethodDescriptor> = Object.fromEntries(
    SELECTION_METHODS.map((name) => [name, { mutating: true }])
  );
  methods.makeWorkPath = { mutating: true, refType: PHOTOSHOP_REMOTE_TYPE.PathItem };
  return methods;
}

export function createSelectionClass(context: PhotoshopContext): { new (reference: RemoteReference): PsSelection } {
  const properties = createSelectionProperties();
  const methods = createSelectionMethods();
  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "selection.propertyGet"])),
    propertySet: {},
    method: Object.fromEntries(SELECTION_METHODS.map((name) => [name, `selection.${name}`])),
    batchGet: "selection.batchGet",
    batchSet: "selection.batchSet",
    dispose: "selection.dispose"
  };
  const config: RemoteClassConfig = {
    rpc: context.rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods,
    argEncoders: context.argEncoders,
    decodeContext: context.registry.decodeContext
  };

  class WebviewPsSelection extends RemoteClass implements PsSelection {
    declare readonly typename: Promise<"Selection">;
    declare readonly docId: Promise<number>;
    declare readonly parent: PsSelection["parent"];
    declare readonly bounds: Promise<ImagingBounds | null>;
    declare readonly solid: Promise<boolean>;

    declare contract: (by: number, applyEffectAtCanvasBounds?: boolean) => Promise<void>;
    declare deselect: () => Promise<void>;
    declare expand: (by: number, applyEffectAtCanvasBounds?: boolean) => Promise<void>;
    declare feather: (by: number, applyEffectAtCanvasBounds?: boolean) => Promise<void>;
    declare grow: (tolerance: number, antiAlias?: boolean) => Promise<void>;
    declare inverse: () => Promise<void>;
    declare load: (from: PsChannel | PsLayer, mode?: SelectionTypeValue, invert?: boolean) => Promise<void>;
    declare makeWorkPath: PsSelection["makeWorkPath"];
    declare selectAll: () => Promise<void>;
    declare selectRectangle: (
      bounds: SelectionBounds,
      mode?: SelectionTypeValue,
      feather?: number,
      antiAlias?: boolean
    ) => Promise<void>;
    declare selectEllipse: (
      bounds: SelectionBounds,
      mode?: SelectionTypeValue,
      feather?: number,
      antiAlias?: boolean
    ) => Promise<void>;
    declare selectPolygon: (
      points: readonly SelectionPoint[],
      mode?: SelectionTypeValue,
      feather?: number,
      antiAlias?: boolean
    ) => Promise<void>;
    declare selectRow: (y: number, mode?: SelectionTypeValue) => Promise<void>;
    declare selectColumn: (x: number, mode?: SelectionTypeValue) => Promise<void>;
    declare save: (channelName?: string) => Promise<void>;
    declare saveTo: (channel: PsChannel, mode?: SelectionTypeValue) => Promise<void>;
    declare selectBorder: (width: number) => Promise<void>;
    declare smooth: (radius: number, applyEffectAtCanvasBounds?: boolean) => Promise<void>;
    declare translateBoundary: (deltaX: number, deltaY: number) => Promise<void>;
    declare resizeBoundary: (
      horizontal?: number,
      vertical?: number,
      anchor?: AnchorPositionValue,
      interpolation?: InterpolationMethodValue
    ) => Promise<void>;
    declare rotateBoundary: (
      angle: number,
      anchor?: AnchorPositionValue,
      interpolation?: InterpolationMethodValue
    ) => Promise<void>;

    constructor(reference: RemoteReference) {
      super(config, reference);
    }
  }

  return WebviewPsSelection;
}
