/**
 * The `photoshop` WebView namespace: builds the type/value/collection registry (ADR 0009), the
 * Document/Layer classes that self-register into it, the `app` entry surface, and attaches the
 * transcribed constant tables. Exports a lazily initialized singleton `photoshop`. All real
 * Photoshop work runs on the UXP host (RFC-0006); this side is proxies only. `src/webview` must
 * never import `src/uxp` (AGENTS.md).
 */

import { getBridgeRpcClient } from "@webview/runtime.js";
import { PhotoshopConstants } from "@shared/photoshop-api/photoshop-constants.js";
import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { PHOTOSHOP_APP_REFERENCE_ID } from "@shared/photoshop-api/photoshop-protocol.js";
import { REMOTE_REFERENCE_KIND } from "@shared/uxp-api/remote-protocol.js";
import type { RemoteArgEncoder } from "@webview/uxp-api/remote/index.js";
import type { UxpStorageProxyInternals } from "@webview/uxp-api/modules/uxp/persistent-file-storage/types.js";
import { createCoreNamespace } from "../core/core.js";
import { ColorConversionModel } from "../core/types.js";
import { createImagingNamespace } from "../imaging/imaging.js";
import { createChannelClass } from "./channel.js";
import { createColorSamplerClass } from "./color-sampler.js";
import { createCountItemClass } from "./count-item.js";
import { createActionClass, createActionSetClass } from "./actions.js";
import { createPhotoshopAppClass } from "./app.js";
import {
  requirePhotoshopCallbackOwner,
  type PhotoshopCallbackOwner,
  type PhotoshopContext,
  type PhotoshopRpc
} from "./context.js";
import { createDocumentClass } from "./document.js";
import { createGuideClass } from "./guide.js";
import { createHistoryStateClass } from "./history-state.js";
import { createLayerClass } from "./layer.js";
import { createLayerCompClass } from "./layer-comp.js";
import { createPathItemClass } from "./path-item.js";
import { createPathPointClass } from "./path-point.js";
import { createPreferenceClass, createPreferencesClass } from "./preferences.js";
import { createPhotoshopTypeRegistry } from "./registry.js";
import { createSelectionClass } from "./selection.js";
import { createSubPathItemClass } from "./sub-path-item.js";
import { SolidColor, encodePhotoshopArgument } from "./solid-color.js";
import { CMYKColor, GrayColor, HSBColor, LabColor, RGBColor } from "./color-models.js";
import { PathPointInfo, SubPathInfo } from "./path-builders.js";
import {
  createCharacterStyleClass,
  createParagraphStyleClass,
  createTextItemClass,
  createTextWarpStyleClass
} from "./text.js";
import { createTextFontClass } from "./text-font.js";
import { createToolClass } from "./tool.js";
import type {
  ActionDescriptor,
  ActionNotificationListener,
  BatchPlayCommandOptions,
  PhotoshopActions,
  PhotoshopApp,
  PhotoshopNamespace
} from "./types.js";

interface ActionListenerRegistration {
  readonly reference: import("@shared/protocol.js").BridgeCallbackReference;
  readonly added: Promise<void>;
  readonly owner: PhotoshopCallbackOwner;
  removing?: Promise<void>;
}

let defaultNamespace: PhotoshopNamespace | undefined;

export function createPhotoshopNamespace(rpc: PhotoshopRpc): PhotoshopNamespace {
  const { context, app } = createPhotoshopContext(rpc);
  const notificationListeners = new WeakMap<
    object,
    WeakMap<ActionNotificationListener, Map<string, ActionListenerRegistration>>
  >();

  const addNotificationListener = async (
    events: readonly string[],
    notifier: ActionNotificationListener
  ): Promise<void> => {
    const normalizedEvents = normalizeActionNotificationEvents(events, notifier);
    const owner = requirePhotoshopCallbackOwner(rpc);
    let scopedListeners = notificationListeners.get(owner);
    if (!scopedListeners) {
      scopedListeners = new WeakMap();
      notificationListeners.set(owner, scopedListeners);
    }
    let registrations = scopedListeners.get(notifier);
    if (!registrations) {
      registrations = new Map();
      scopedListeners.set(notifier, registrations);
    }
    const key = JSON.stringify(normalizedEvents);
    const existing = registrations.get(key);
    if (existing) {
      if (existing.removing) {
        await existing.removing;
        return addNotificationListener(normalizedEvents, notifier);
      }
      return existing.added;
    }
    const reference = owner.retainCallback(notifier);
    const added = context.rpc.call<void>(PHOTOSHOP_MODULE_ID, "action.addNotificationListener", [
      normalizedEvents,
      reference
    ]);
    const registration = { reference, added, owner };
    registrations.set(key, registration);
    try {
      await added;
    } catch (error) {
      if (registrations.get(key) === registration) registrations.delete(key);
      owner.releaseCallback(reference);
      throw error;
    }
  };

  const removeNotificationListener = async (
    events: readonly string[],
    notifier: ActionNotificationListener
  ): Promise<void> => {
    const normalizedEvents = normalizeActionNotificationEvents(events, notifier);
    const owner = requirePhotoshopCallbackOwner(rpc);
    const registrations = notificationListeners.get(owner)?.get(notifier);
    const key = JSON.stringify(normalizedEvents);
    const registration = registrations?.get(key);
    if (!registration) return;
    if (registration.removing) {
      return registration.removing;
    }
    const removing = registration.added.then(async () => {
      await context.rpc.call<void>(PHOTOSHOP_MODULE_ID, "action.removeNotificationListener", [
        normalizedEvents,
        registration.reference
      ]);
      if (registrations?.get(key) === registration) {
        registrations.delete(key);
        registration.owner.releaseCallback(registration.reference);
      }
    });
    registration.removing = removing;
    try {
      await removing;
    } finally {
      if (registrations?.get(key) === registration) {
        delete registration.removing;
      }
    }
  };

  const action: PhotoshopActions = {
    addNotificationListener,
    batchPlay(
      commands: readonly ActionDescriptor[],
      options?: BatchPlayCommandOptions
    ): Promise<ActionDescriptor[]> {
      return batchPlay(context, commands, options);
    },
    batchPlaySync(
      commands: readonly ActionDescriptor[],
      options?: BatchPlayCommandOptions
    ): Promise<ActionDescriptor[]> {
      return batchPlaySync(context, commands, options);
    },
    getIDFromString: (value) =>
      context.rpc.call<number>(PHOTOSHOP_MODULE_ID, "action.getIDFromString", [value]),
    recordAction: (options, info) =>
      context.rpc.call<void>(PHOTOSHOP_MODULE_ID, "action.recordAction", [options, info]),
    removeNotificationListener,
    validateReference: (ref) =>
      context.rpc.call<boolean>(PHOTOSHOP_MODULE_ID, "action.validateReference", [ref])
  };

  return {
    app,
    action,
    core: createCoreNamespace(rpc),
    ColorConversionModel,
    SolidColor,
    CMYKColor,
    GrayColor,
    HSBColor,
    LabColor,
    RGBColor,
    PathPointInfo,
    SubPathInfo,
    imaging: createImagingNamespace(rpc),
    get preferences() { return app.preferences; },
    get preferencesCursors() { return app.preferences.then((value) => value.cursors); },
    get preferencesFileHandling() { return app.preferences.then((value) => value.fileHandling); },
    get preferencesGeneral() { return app.preferences.then((value) => value.general); },
    get preferencesGuidesGridsAndSlices() { return app.preferences.then((value) => value.guidesGridsAndSlices); },
    get preferencesHistory() { return app.preferences.then((value) => value.history); },
    get preferencesInterface() { return app.preferences.then((value) => value.interface); },
    get preferencesNotifications() { return app.preferences.then((value) => value.notifications); },
    get preferencesPerformance() { return app.preferences.then((value) => value.performance); },
    get preferencesTools() { return app.preferences.then((value) => value.tools); },
    get preferencesTransparencyAndGamut() { return app.preferences.then((value) => value.transparencyAndGamut); },
    get preferencesType() { return app.preferences.then((value) => value.type); },
    get preferencesUnitsAndRulers() { return app.preferences.then((value) => value.unitsAndRulers); },
    constants: PhotoshopConstants,
    ...PhotoshopConstants
  };
}

/**
 * Assemble the per-namespace context. The type registry is created empty, then Document and Layer
 * register their factories into it; the Document↔Layer cycle is fine because the registry's decode
 * resolver looks factories up lazily at decode time (ADR 0009), not at construction time. `Layer`
 * collections declare their `getByName`/`add` RPC capabilities so every `Layers` snapshot behaves
 * identically regardless of which property/method produced it.
 */
function createPhotoshopContext(rpc: PhotoshopRpc): { readonly context: PhotoshopContext; readonly app: PhotoshopApp } {
  const argEncoders = [encodePhotoshopArgument, encodeUxpStorageArgument];
  const registry = createPhotoshopTypeRegistry(rpc, argEncoders);
  const context: PhotoshopContext = { rpc, registry, argEncoders };

  const AppClass = createPhotoshopAppClass(context);
  const DocumentClass = createDocumentClass(context);
  const LayerClass = createLayerClass(context);
  const ChannelClass = createChannelClass(context);
  const ColorSamplerClass = createColorSamplerClass(context);
  const CountItemClass = createCountItemClass(context);
  const LayerCompClass = createLayerCompClass(context);
  const SelectionClass = createSelectionClass(context);
  const HistoryStateClass = createHistoryStateClass(context);
  const GuideClass = createGuideClass(context);
  const PathItemClass = createPathItemClass(context);
  const SubPathItemClass = createSubPathItemClass(context);
  const PathPointClass = createPathPointClass(context);
  const TextFontClass = createTextFontClass(context);
  const TextItemClass = createTextItemClass(context);
  const CharacterStyleClass = createCharacterStyleClass(context);
  const ParagraphStyleClass = createParagraphStyleClass(context);
  const TextWarpStyleClass = createTextWarpStyleClass(context);
  const ToolClass = createToolClass(context);
  const ActionSetClass = createActionSetClass(context);
  const ActionClass = createActionClass(context);
  const PreferencesClass = createPreferencesClass(context);

  let appInstance: PhotoshopApp;
  registry.register(PHOTOSHOP_REMOTE_TYPE.Photoshop, (reference) => appInstance ??= new AppClass(reference));

  registry.register(PHOTOSHOP_REMOTE_TYPE.Document, (reference) => new DocumentClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Layer, (reference) => new LayerClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Channel, (reference) => new ChannelClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.ColorSampler, (reference) => new ColorSamplerClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.CountItem, (reference) => new CountItemClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.LayerComp, (reference) => new LayerCompClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Selection, (reference) => new SelectionClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.HistoryState, (reference) => new HistoryStateClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Guide, (reference) => new GuideClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.PathItem, (reference) => new PathItemClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.SubPathItem, (reference) => new SubPathItemClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.PathPoint, (reference) => new PathPointClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.TextFont, (reference) => new TextFontClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.TextItem, (reference) => new TextItemClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.CharacterStyle, (reference) => new CharacterStyleClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.ParagraphStyle, (reference) => new ParagraphStyleClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.TextWarpStyle, (reference) => new TextWarpStyleClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Tool, (reference) => new ToolClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.ActionSet, (reference) => new ActionSetClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Action, (reference) => new ActionClass(reference));
  registry.register(PHOTOSHOP_REMOTE_TYPE.Preferences, (reference) => new PreferencesClass(reference));
  for (const type of [
    PHOTOSHOP_REMOTE_TYPE.PreferencesCursors,
    PHOTOSHOP_REMOTE_TYPE.PreferencesFileHandling,
    PHOTOSHOP_REMOTE_TYPE.PreferencesGeneral,
    PHOTOSHOP_REMOTE_TYPE.PreferencesGuidesGridsAndSlices,
    PHOTOSHOP_REMOTE_TYPE.PreferencesHistory,
    PHOTOSHOP_REMOTE_TYPE.PreferencesInterface,
    PHOTOSHOP_REMOTE_TYPE.PreferencesNotifications,
    PHOTOSHOP_REMOTE_TYPE.PreferencesPerformance,
    PHOTOSHOP_REMOTE_TYPE.PreferencesTools,
    PHOTOSHOP_REMOTE_TYPE.PreferencesTransparencyAndGamut,
    PHOTOSHOP_REMOTE_TYPE.PreferencesType,
    PHOTOSHOP_REMOTE_TYPE.PreferencesUnitsAndRulers
  ] as const) {
    const PreferenceClass = createPreferenceClass(context, type);
    registry.register(type, (reference) => new PreferenceClass(reference));
  }
  appInstance = new AppClass({
    kind: REMOTE_REFERENCE_KIND,
    type: PHOTOSHOP_REMOTE_TYPE.Photoshop,
    id: PHOTOSHOP_APP_REFERENCE_ID
  });

  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Document, {
    parent: true,
    typename: "Documents",
    methods: {
      getByName: { rpc: "documents.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.Document } },
      add: { rpc: "documents.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.Document } }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Layer, {
    typename: "Layers",
    methods: {
      getByName: { rpc: "layers.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.Layer } },
      add: { rpc: "layers.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.Layer } }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Channel, {
    parent: true,
    typename: "Channels",
    methods: {
      getByName: { rpc: "channels.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.Channel } },
      add: { rpc: "channels.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.Channel } },
      removeAll: { rpc: "channels.removeAll" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.ColorSampler, {
    parent: true,
    methods: {
      add: { rpc: "colorSamplers.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.ColorSampler } },
      removeAll: { rpc: "colorSamplers.removeAll" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.CountItem, {
    parent: true,
    typename: "CountItems",
    methods: {
      add: { rpc: "countItems.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.CountItem } },
      removeAllFromActiveGroup: { rpc: "countItems.removeAllFromActiveGroup" },
      getAll: { rpc: "countItems.getAll", result: { collectionOf: PHOTOSHOP_REMOTE_TYPE.CountItem } },
      createGroup: { rpc: "countItems.createGroup" },
      renameActiveGroup: { rpc: "countItems.renameActiveGroup" },
      removeGroupByIndex: { rpc: "countItems.removeGroupByIndex" },
      toggleActiveGroupVisibility: { rpc: "countItems.toggleActiveGroupVisibility" },
      activateGroupByIndex: { rpc: "countItems.activateGroupByIndex" },
      setActiveMarkerSize: { rpc: "countItems.setActiveMarkerSize" },
      setActiveLabelSize: { rpc: "countItems.setActiveLabelSize" },
      setActiveColor: { rpc: "countItems.setActiveColor" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.LayerComp, {
    parent: true,
    typename: "LayerComps",
    methods: {
      add: { rpc: "layerComps.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.LayerComp } },
      getAllByName: { rpc: "layerComps.getAllByName", result: { collectionOf: PHOTOSHOP_REMOTE_TYPE.LayerComp } },
      removeAll: { rpc: "layerComps.removeAll" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.HistoryState, {
    parent: true,
    typename: "HistoryStates",
    methods: {
      getByName: { rpc: "historyStates.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.HistoryState } }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Guide, {
    parent: true,
    typename: "Guides",
    methods: {
      add: { rpc: "guides.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.Guide } },
      removeAll: { rpc: "guides.removeAll" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.PathItem, {
    parent: true,
    typename: "PathItems",
    methods: {
      getByName: { rpc: "pathItems.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.PathItem } },
      add: { rpc: "pathItems.add", result: { refType: PHOTOSHOP_REMOTE_TYPE.PathItem } },
      removeAll: { rpc: "pathItems.removeAll" }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.SubPathItem, { parent: true, typename: "SubPathItems" });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.PathPoint, { parent: true, typename: "PathPoints" });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.TextFont, {
    parent: true,
    typename: "TextFonts",
    methods: {
      getByName: { rpc: "textFonts.getByName", result: { refType: PHOTOSHOP_REMOTE_TYPE.TextFont } }
    }
  });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.ActionSet, { parent: true });
  registry.registerCollectionCapabilities(PHOTOSHOP_REMOTE_TYPE.Action, { parent: true });

  return { context, app: appInstance };
}

const encodeUxpStorageArgument: RemoteArgEncoder = (value) => {
  const holder = value as Partial<UxpStorageProxyInternals> | null;
  return typeof holder?.toUxpStorageReference === "function"
    ? holder.toUxpStorageReference()
    : undefined;
};

/**
 * Verbatim `batchPlay` passthrough (ADR 0010): one RPC carrying `[commands, options]` as plain JSON;
 * the host's result descriptor array is returned unchanged. No arg-encoding and no reference decode
 * happen here — descriptors are opaque and any native `_ref`/`_id` inside them is the caller's.
 */
function batchPlay(
  context: PhotoshopContext,
  commands: readonly ActionDescriptor[],
  options?: BatchPlayCommandOptions
): Promise<ActionDescriptor[]> {
  const args = options === undefined ? [commands] : [commands, options];
  return context.rpc.call<ActionDescriptor[]>(PHOTOSHOP_MODULE_ID, "action.batchPlay", args);
}

/** Host-synchronous batchPlay exposed as an asynchronous WebView RPC. */
function batchPlaySync(
  context: PhotoshopContext,
  commands: readonly ActionDescriptor[],
  options?: BatchPlayCommandOptions
): Promise<ActionDescriptor[]> {
  const args = options === undefined ? [commands] : [commands, options];
  return context.rpc.call<ActionDescriptor[]>(PHOTOSHOP_MODULE_ID, "action.batchPlaySync", args);
}

export const photoshop: PhotoshopNamespace =
  defaultNamespace ??
  (defaultNamespace = createPhotoshopNamespace({
    call: <T>(module: string, method: string, args?: readonly unknown[]) =>
      getBridgeRpcClient().call<T>(module, method, args),
    get activeModalSessionId() {
      return getBridgeRpcClient().activeModalSessionId;
    },
    get callbackScope() {
      return getBridgeRpcClient();
    },
    retainCallback: (callback) =>
      getBridgeRpcClient().retainCallback(callback as (...args: readonly unknown[]) => unknown),
    releaseCallback: (reference) => getBridgeRpcClient().releaseCallback(reference)
  }));

function normalizeActionNotificationEvents(
  events: readonly string[],
  notifier: ActionNotificationListener
): readonly string[] {
  if (typeof notifier !== "function") {
    throw new TypeError("Action notification notifier must be a function.");
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new TypeError("Action notification events must be a non-empty array.");
  }
  if (events.some((event) => typeof event !== "string" || event.length === 0)) {
    throw new TypeError("Action notification events must contain non-empty strings.");
  }
  return [...new Set(events)].sort();
}
