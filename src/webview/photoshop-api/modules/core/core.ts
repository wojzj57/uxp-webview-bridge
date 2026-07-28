import {
  PHOTOSHOP_CORE_MODULE_ID,
  type PhotoshopCoreRpcMethodName
} from "@shared/photoshop-api/core-protocol.js";
import type { BridgeCallbackReference } from "@shared/protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type {
  CalculateDialogSizeOptions,
  ColorConversionModel,
  ColorDescriptor,
  CoreNotificationDescriptor,
  CoreNotificationListener,
  CoreCancellationEvent,
  CorePoint,
  CreateTemporaryDocumentOptions,
  CreateTemporaryDocumentResult,
  DeleteTemporaryDocumentOptions,
  ConvertedColor,
  DisplayConfigurationOptions,
  DocumentCoreOptions,
  ExecuteAsModalOptions,
  ExecuteAsModalTarget,
  ExecutionContext,
  ExecutionHostControl,
  GetLayerGroupContentsOptions,
  HistorySuspendedOptions,
  MenuCommandMenuIDOptions,
  MenuCommandOptions,
  PhotoshopCore,
  ReportProgressOptions,
  ResumeHistoryOptions,
  RedrawDocumentOptions,
  SetExecutionModeOptions,
  ShowAlertOptions,
  SuppressResizeGripperOptions
} from "./types.js";

interface CoreRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
  readonly activeModalSessionId?: string | undefined;
  readonly callbackScope?: object | undefined;
  retainCallback?(callback: (...args: never[]) => unknown): BridgeCallbackReference;
  releaseCallback?(reference: BridgeCallbackReference): void;
}

interface ListenerRegistration {
  readonly reference: BridgeCallbackReference;
  readonly added: Promise<void>;
  removing?: Promise<void>;
}

interface CoreCallbackOwner {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
  readonly activeModalSessionId?: string | undefined;
  retainCallback(callback: (...args: never[]) => unknown): BridgeCallbackReference;
  releaseCallback(reference: BridgeCallbackReference): void;
}

interface CoreCallbackState {
  readonly listeners: WeakMap<CoreNotificationListener, Map<string, ListenerRegistration>>;
  modalQueue: Promise<void>;
}

/** Build the WebView proxy for `photoshop.core`. */
export function createCoreNamespace(rpc: CoreRpc): PhotoshopCore {
  const call = <T>(method: PhotoshopCoreRpcMethodName, args?: readonly unknown[]): Promise<T> =>
    rpc.call<T>(PHOTOSHOP_CORE_MODULE_ID, method, args);
  const callbackStates = new WeakMap<object, CoreCallbackState>();

  const getCallbackState = (owner: CoreCallbackOwner): CoreCallbackState => {
    const existing = callbackStates.get(owner);
    if (existing) return existing;
    const state = {
      listeners: new WeakMap<CoreNotificationListener, Map<string, ListenerRegistration>>(),
      modalQueue: Promise.resolve()
    };
    callbackStates.set(owner, state);
    return state;
  };

  const addNotificationListener = async (
    group: string,
    events: readonly string[],
    listener: CoreNotificationListener
  ): Promise<void> => {
    const owner = requireCoreCallbackOwner(rpc);
    const state = getCallbackState(owner);
    const normalizedEvents = normalizeNotificationKey(group, events);
    let registrations = state.listeners.get(listener);
    if (!registrations) {
      registrations = new Map();
      state.listeners.set(listener, registrations);
    }
    const key = notificationKey(group, normalizedEvents);
    const existing = registrations.get(key);
    if (existing) {
      if (existing.removing) {
        await existing.removing;
        return addNotificationListener(group, normalizedEvents, listener);
      }
      return existing.added;
    }
    const reference = owner.retainCallback(listener);
    const added = owner.call<void>(PHOTOSHOP_CORE_MODULE_ID, "core.addNotificationListener", [group, normalizedEvents, reference]);
    const registration = { reference, added };
    registrations.set(key, registration);
    try {
      await added;
    } catch (error) {
      if (registrations.get(key) === registration) {
        registrations.delete(key);
      }
      owner.releaseCallback(reference);
      throw error;
    }
  };

  const removeNotificationListener = async (
    group: string,
    events: readonly string[],
    listener: CoreNotificationListener
  ): Promise<void> => {
    const owner = requireCoreCallbackOwner(rpc);
    const state = getCallbackState(owner);
    const normalizedEvents = normalizeNotificationKey(group, events);
    const registrations = state.listeners.get(listener);
    const key = notificationKey(group, normalizedEvents);
    const registration = registrations?.get(key);
    if (!registration) {
      return;
    }
    if (registration.removing) {
      return registration.removing;
    }
    const removing = registration.added.then(async () => {
      await owner.call<void>(PHOTOSHOP_CORE_MODULE_ID, "core.removeNotificationListener", [
        group,
        normalizedEvents,
        registration.reference
      ]);
      if (registrations?.get(key) === registration) {
        registrations.delete(key);
        owner.releaseCallback(registration.reference);
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

  const executeAsModal = <Result>(
    target: ExecuteAsModalTarget<Result>,
    options: ExecuteAsModalOptions
  ): Promise<Result> => {
    const owner = requireCoreCallbackOwner(rpc);
    const state = getCallbackState(owner);
    if (owner.activeModalSessionId !== undefined) {
      return Promise.reject(nestedModalError());
    }
    const scopedCall = <T>(method: PhotoshopCoreRpcMethodName, args?: readonly unknown[]) =>
      owner.call<T>(PHOTOSHOP_CORE_MODULE_ID, method, args);
    const run = (): Promise<Result> => executeModalCall(
      target,
      options,
      scopedCall,
      (callback) => owner.retainCallback(callback),
      (reference) => owner.releaseCallback(reference)
    );
    const result = state.modalQueue.then(run, run);
    state.modalQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    get apiVersion(): Promise<number> {
      return call<number>("core.apiVersion");
    },
    addNotificationListener,
    calculateDialogSize: (options: CalculateDialogSizeOptions) =>
      call("core.calculateDialogSize", [options]),
    convertColor: <Model extends ColorConversionModel>(sourceColor: ColorDescriptor, targetModel: Model) =>
      call<ConvertedColor<Model>>("core.convertColor", [sourceColor, targetModel]),
    convertGlobalToLocal: (target: string, location: CorePoint) =>
      call<CorePoint>("core.convertGlobalToLocal", [target, location]),
    createTemporaryDocument: (options: CreateTemporaryDocumentOptions) =>
      call<CreateTemporaryDocumentResult>("core.createTemporaryDocument", [options]),
    deleteTemporaryDocument: (options: DeleteTemporaryDocumentOptions) =>
      call<void>("core.deleteTemporaryDocument", [options]),
    endModalToolState: (commit: boolean) => call<void>("core.endModalToolState", [commit]),
    executeAsModal,
    getActiveTool: () => call("core.getActiveTool"),
    getCPUInfo: () => call("core.getCPUInfo"),
    getDisplayConfiguration: (options?: DisplayConfigurationOptions) =>
      call("core.getDisplayConfiguration", options === undefined ? undefined : [options]),
    getGPUInfo: () => call("core.getGPUInfo"),
    getLayerGroupContents: (options: GetLayerGroupContentsOptions) =>
      call("core.getLayerGroupContents", [options]),
    getLayerGroupContentsSync: (options: GetLayerGroupContentsOptions) =>
      call("core.getLayerGroupContentsSync", [options]),
    getLayerTree: (options: DocumentCoreOptions) => call("core.getLayerTree", [options]),
    getLayerTreeSync: (options: DocumentCoreOptions) => call("core.getLayerTreeSync", [options]),
    getMenuCommandState: (options: MenuCommandOptions) =>
      call("core.getMenuCommandState", [options]),
    getMenuCommandTitle: (options: MenuCommandOptions | MenuCommandMenuIDOptions) =>
      call("core.getMenuCommandTitle", [options]),
    getPluginInfo: () => call("core.getPluginInfo"),
    getUserIdleTime: () => call("core.getUserIdleTime"),
    historySuspended: (options: HistorySuspendedOptions) =>
      call("core.historySuspended", [options]),
    isModal: () => call("core.isModal"),
    performMenuCommand: (options: MenuCommandOptions) =>
      call<boolean>("core.performMenuCommand", [options]),
    redrawDocument: (options: RedrawDocumentOptions) =>
      call<number>("core.redrawDocument", [options]),
    removeNotificationListener,
    setExecutionMode: (options: SetExecutionModeOptions) =>
      call<void>("core.setExecutionMode", [options]),
    setUserIdleTime: (idleTime: number) => call<void>("core.setUserIdleTime", [idleTime]),
    showAlert: (options: ShowAlertOptions) => call<void>("core.showAlert", [options]),
    suppressResizeGripper: (options: SuppressResizeGripperOptions) =>
      call<void>("core.suppressResizeGripper", [options]),
    translateUIString: (zstring: string) => call("core.translateUIString", [zstring])
  };
}

export const core: PhotoshopCore = createCoreNamespace({
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
});

function requireCoreCallbackOwner(rpc: CoreRpc): CoreCallbackOwner {
  const candidate = rpc.callbackScope ?? rpc;
  if (
    typeof (candidate as Partial<CoreCallbackOwner>).call !== "function" ||
    typeof (candidate as Partial<CoreCallbackOwner>).retainCallback !== "function" ||
    typeof (candidate as Partial<CoreCallbackOwner>).releaseCallback !== "function"
  ) {
    throw new Error("This bridge RPC transport does not support callbacks.");
  }
  return candidate as CoreCallbackOwner;
}

function normalizeNotificationKey(group: string, events: readonly string[]): readonly string[] {
  if (typeof group !== "string" || group.length === 0) {
    throw new TypeError("Notification group must be a non-empty string.");
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new TypeError("Notification events must be a non-empty array.");
  }
  const normalized = [...new Set(events)];
  if (normalized.some((event) => typeof event !== "string" || event.length === 0)) {
    throw new TypeError("Notification events must contain non-empty strings.");
  }
  return normalized.sort();
}

function notificationKey(group: string, events: readonly string[]): string {
  return JSON.stringify([group, events]);
}

function nestedModalError(): Error {
  return Object.assign(
    new Error("photoshop.core.executeAsModal cannot be nested inside an active modal callback."),
    { name: "PhotoshopCoreNestedModalError", code: "ERR_NESTED_EXECUTE_AS_MODAL" }
  );
}

async function executeModalCall<Result>(
  target: ExecuteAsModalTarget<Result>,
  options: ExecuteAsModalOptions,
  call: <T>(method: PhotoshopCoreRpcMethodName, args?: readonly unknown[]) => Promise<T>,
  retain: (callback: (...args: never[]) => unknown) => BridgeCallbackReference,
  release: (reference: BridgeCallbackReference) => void
): Promise<Result> {
  let context: MutableExecutionContext | undefined;
  const cancelReference = retain(async (...args: readonly unknown[]) => {
    if (!context) return;
    context.cancelled = true;
    await context.onCancel?.(normalizeCancellationEvent(args[0]));
  });
  const targetReference = retain(async (...args: readonly unknown[]) => {
    const state = (args[0] ?? {}) as { readonly isCancelled?: unknown };
    const descriptor = args[1] as CoreNotificationDescriptor | undefined;
    context = createExecutionContext(Boolean(state.isCancelled), call);
    try {
      const result = await target(context.facade, descriptor);
      await context.flushProgress();
      return result;
    } catch (error) {
      try {
        await context.flushProgress();
      } catch {
        // The target error is authoritative when target and queued progress both fail.
      }
      throw error;
    }
  });
  try {
    return await call<Result>("core.executeAsModal", [targetReference, cancelReference, options]);
  } finally {
    release(targetReference);
    release(cancelReference);
    context = undefined;
  }
}

interface MutableExecutionContext {
  cancelled: boolean;
  onCancel: ((event?: CoreCancellationEvent) => void | Promise<void>) | undefined;
  facade: ExecutionContext;
  flushProgress(): Promise<void>;
}

function normalizeCancellationEvent(value: unknown): CoreCancellationEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reason = (value as { readonly reason?: unknown }).reason;
  return typeof reason === "string" ? { reason } : undefined;
}

function createExecutionContext(
  initiallyCancelled: boolean,
  call: <T>(method: PhotoshopCoreRpcMethodName, args?: readonly unknown[]) => Promise<T>
): MutableExecutionContext {
  let progressQueue: Promise<void> = Promise.resolve();
  const state: MutableExecutionContext = {
    cancelled: initiallyCancelled,
    onCancel: undefined,
    facade: undefined as unknown as ExecutionContext,
    flushProgress: () => progressQueue
  };
  const hostControl: ExecutionHostControl = {
    suspendHistory: (options) => call("modal.suspendHistory", [options]),
    resumeHistory: (suspension: ResumeHistoryOptions, commit?: boolean) =>
      call<void>("modal.resumeHistory", [suspension, commit]),
    registerAutoCloseDocument: (documentID) =>
      call<void>("modal.registerAutoCloseDocument", [documentID]),
    unregisterAutoCloseDocument: (documentID) =>
      call<void>("modal.unregisterAutoCloseDocument", [documentID])
  };
  state.facade = {
    get isCancelled() {
      return state.cancelled;
    },
    get onCancel() {
      return state.onCancel;
    },
    set onCancel(value) {
      state.onCancel = value;
    },
    reportProgress(options: ReportProgressOptions): void {
      progressQueue = progressQueue.then(() => call<void>("modal.reportProgress", [options]));
    },
    hostControl
  };
  return state;
}
