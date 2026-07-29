import {
  assertPhotoshopCoreRpcMethodName,
  PHOTOSHOP_CORE_MODULE_ID,
  type PhotoshopCoreInternalMethodName,
  type PhotoshopCoreMethodName
} from "@shared/photoshop-api/core-protocol.js";
import { BridgeRemoteError } from "@shared/errors.js";
import {
  isBridgeCallbackReference,
  type BridgeCallbackReference
} from "@shared/protocol.js";
import type {
  UxpCallbackBridge,
  UxpDispatchContext,
  UxpModuleAdapter
} from "@uxp/module-registry.js";
import {
  normalizeActiveTool,
  normalizeLayerTreeList,
  normalizeMenuCommandResult,
  normalizeMenuState,
  normalizeMenuTitle,
  normalizePoint,
  normalizeTemporaryDocument,
  normalizeSize
} from "./results.js";
import {
  createTemporaryDocumentOwner,
  type TemporaryDocumentOwnerOptions
} from "./temporary-document-owner.js";
import type { PhotoshopCoreHost, PhotoshopCoreHostModule } from "./types.js";
import {
  assertBoolean,
  assertColorConversionModel,
  assertFiniteNumber,
  assertInteger,
  assertKnownKeys,
  assertNonNegativeNumber,
  assertObject,
  assertOptionalScheduling,
  assertPoint,
  assertPositiveInteger,
  assertSize,
  assertString,
  expectArgs,
  expectArgsRange,
  expectDocumentOptions,
  expectOptions
} from "./validation.js";

declare const require: (moduleName: "photoshop") => PhotoshopCoreHostModule;

const temporaryDocumentOwner = createTemporaryDocumentOwner();
const TEMPORARY_DOCUMENT_CLEANUP_SUBSCRIPTION_ID = "photoshop.core.temporary-documents";
let temporaryDocumentOptions: TemporaryDocumentOwnerOptions = {};
const temporaryOwners = new WeakMap<UxpCallbackBridge, ReturnType<typeof createTemporaryDocumentOwner>>();
const notificationRegistrations = new WeakMap<UxpCallbackBridge, Map<string, NotificationRegistration>>();
const modalContexts = new WeakMap<UxpCallbackBridge, Map<string, Record<string, unknown>>>();

interface NotificationRegistration {
  readonly subscriptionId: string;
  readonly group: string;
  readonly events: readonly string[];
  readonly reference: BridgeCallbackReference;
  readonly nativeListener: (...args: readonly unknown[]) => void;
  readonly added: Promise<void>;
  removing?: Promise<void>;
}

export function configureCoreAdapter(options: TemporaryDocumentOwnerOptions): void {
  temporaryDocumentOptions = options;
  temporaryDocumentOwner.configure(options);
}

export const coreModuleAdapter: UxpModuleAdapter = {
  moduleId: PHOTOSHOP_CORE_MODULE_ID,
  capability: "photoshop",
  dispatch: dispatchCoreCall,
  destroy: destroyCoreAdapter
};

/** Dispatch the complete Core surface and its modal-session-only internal calls. */
export function dispatchCoreCall(
  method: string,
  args: readonly unknown[],
  context?: UxpDispatchContext
): unknown {
  assertPhotoshopCoreRpcMethodName(method);
  const core = getCore();

  switch (method) {
    case "core.apiVersion":
      expectArgs(args, 0, method);
      return assertFiniteNumber(core.apiVersion, `${method} result`);
    case "core.addNotificationListener":
      return dispatchAddNotificationListener(core, args, method, context);
    case "core.calculateDialogSize":
      return dispatchCalculateDialogSize(core, args, method);
    case "core.convertColor":
      return dispatchConvertColor(core, args, method);
    case "core.convertGlobalToLocal":
      return dispatchConvertGlobalToLocal(core, args, method);
    case "core.createTemporaryDocument":
      return dispatchCreateTemporaryDocument(core, args, method, context);
    case "core.deleteTemporaryDocument":
      return dispatchDeleteTemporaryDocument(core, args, method, context);
    case "core.endModalToolState":
      return dispatchEndModalToolState(core, args, method);
    case "core.executeAsModal":
      return dispatchExecuteAsModal(core, args, method, context);
    case "core.getActiveTool":
      return dispatchActiveTool(core, args, method);
    case "core.getCPUInfo":
    case "core.getGPUInfo":
    case "core.getPluginInfo":
      return dispatchObjectQuery(core, args, method);
    case "core.getLayerGroupContents":
    case "core.getLayerGroupContentsSync":
      return dispatchLayerGroupContents(core, args, method);
    case "core.getLayerTree":
    case "core.getLayerTreeSync":
      return dispatchLayerTree(core, args, method);
    case "core.getDisplayConfiguration":
      return dispatchDisplayConfiguration(core, args, method);
    case "core.getMenuCommandState":
      return dispatchMenuCommandState(core, args, method);
    case "core.getMenuCommandTitle":
      return dispatchMenuCommandTitle(core, args, method);
    case "core.getUserIdleTime":
      expectArgs(args, 0, method);
      return resolveResult(callCore(core, "getUserIdleTime"), (value) =>
        assertFiniteNumber(value, `${method} result`)
      );
    case "core.historySuspended":
      return dispatchHistorySuspended(core, args, method);
    case "core.isModal":
      expectArgs(args, 0, method);
      return resolveResult(callCore(core, "isModal"), (value) =>
        assertBoolean(value, `${method} result`)
      );
    case "core.performMenuCommand":
      return dispatchPerformMenuCommand(core, args, method);
    case "core.redrawDocument":
      return dispatchRedrawDocument(core, args, method, context);
    case "core.removeNotificationListener":
      return dispatchRemoveNotificationListener(core, args, method, context);
    case "core.setExecutionMode":
      return dispatchSetExecutionMode(core, args, method);
    case "core.setUserIdleTime":
      return dispatchSetUserIdleTime(core, args, method);
    case "core.showAlert":
      return dispatchShowAlert(core, args, method);
    case "core.suppressResizeGripper":
      return dispatchSuppressResizeGripper(core, args, method);
    case "core.translateUIString":
      expectArgs(args, 1, method);
      return resolveResult(
        callCore(core, "translateUIString", [assertString(args[0], `${method} zstring`)]),
        (value) => assertString(value, `${method} result`)
      );
    case "modal.reportProgress":
    case "modal.suspendHistory":
    case "modal.resumeHistory":
    case "modal.registerAutoCloseDocument":
    case "modal.unregisterAutoCloseDocument":
      return dispatchModalHostControl(args, method, context);
    default:
      return unsupported(method);
  }
}

function dispatchAddNotificationListener(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.addNotificationListener",
  context?: UxpDispatchContext
): Promise<void> {
  expectArgs(args, 3, method);
  const callbacks = requireCallbackContext(context, method);
  const group = assertNonEmptyString(args[0], `${method} group`);
  const events = normalizeEvents(args[1], method);
  const reference = assertCallbackReference(args[2], `${method} listener`);
  const key = notificationRegistrationKey(group, events, reference.callbackId);
  let registrations = notificationRegistrations.get(callbacks);
  if (!registrations) {
    registrations = new Map();
    notificationRegistrations.set(callbacks, registrations);
  }
  if (registrations.has(key)) {
    const existing = registrations.get(key);
    if (existing?.removing) {
      return existing.removing.then(() =>
        dispatchAddNotificationListener(core, [group, events, reference], method, context)
      );
    }
    return existing?.added ?? Promise.resolve();
  }
  const subscriptionId = `photoshop.core.notification:${key}`;
  const nativeListener = (...nativeArgs: readonly unknown[]): void => {
    const eventName = typeof nativeArgs[0] === "string" ? nativeArgs[0] : "";
    const descriptor = nativeArgs[1] ?? {};
    void Promise.resolve().then(() => callbacks.invoke(reference, [eventName, descriptor], {
      mode: "listener",
      subscriptionId,
      ...(context?.operationId === undefined ? {} : { parentOperationId: context.operationId })
    })).catch(() => undefined);
  };
  const addNative = requireCoreMethod(core, "addNotificationListener");
  const removeNative = requireCoreMethod(core, "removeNotificationListener");
  let registration: NotificationRegistration;
  const added = Promise.resolve()
    .then(() => addNative.call(core, group, events, nativeListener))
    .then(async () => {
      callbacks.registerSubscription(subscriptionId, async () => {
        await removeNative.call(core, group, events, nativeListener);
        registrations?.delete(key);
      });
      if (context?.signal?.aborted) {
        await callbacks.unregisterSubscription(subscriptionId);
        throw coreRemoteError(
          "PhotoshopCoreOperationAbortedError",
          `${method} was aborted after the native listener was registered; it was removed.`,
          "ERR_PHOTOSHOP_CORE_OPERATION_ABORTED"
        );
      }
    })
    .catch((error: unknown) => {
      if (registrations?.get(key) === registration) registrations.delete(key);
      throw error;
    });
  registration = { subscriptionId, group, events, reference, nativeListener, added };
  registrations.set(key, registration);
  return added;
}

function dispatchRemoveNotificationListener(
  _core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.removeNotificationListener",
  context?: UxpDispatchContext
): Promise<void> {
  expectArgs(args, 3, method);
  const callbacks = requireCallbackContext(context, method);
  const group = assertNonEmptyString(args[0], `${method} group`);
  const events = normalizeEvents(args[1], method);
  const reference = assertCallbackReference(args[2], `${method} listener`);
  const key = notificationRegistrationKey(group, events, reference.callbackId);
  const registration = notificationRegistrations.get(callbacks)?.get(key);
  if (!registration) return Promise.resolve();
  if (registration.removing) return registration.removing;
  const removing = registration.added.then(() => callbacks.unregisterSubscription(registration.subscriptionId));
  registration.removing = removing;
  return removing.finally(() => {
    if (notificationRegistrations.get(callbacks)?.get(key) === registration) {
      delete registration.removing;
    }
  });
}

function dispatchExecuteAsModal(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.executeAsModal",
  context?: UxpDispatchContext
): Promise<unknown> {
  expectArgs(args, 3, method);
  const callbacks = requireCallbackContext(context, method);
  if (callbacks.activeModalSessionId !== undefined) {
    throw coreRemoteError(
      "PhotoshopCoreNestedModalError",
      "photoshop.core.executeAsModal cannot be nested inside an active modal callback.",
      "ERR_NESTED_EXECUTE_AS_MODAL"
    );
  }
  const targetReference = assertCallbackReference(args[0], `${method} target`);
  const cancelReference = assertCallbackReference(args[1], `${method} cancel callback`);
  const options = assertObject(args[2], `${method} options`);
  assertKnownKeys(options, ["commandName", "descriptor", "interactive", "timeOut"], `${method} options`);
  assertNonEmptyString(options.commandName, `${method} options.commandName`);
  if (options.descriptor !== undefined) assertObject(options.descriptor, `${method} options.descriptor`);
  if (options.interactive !== undefined) assertBoolean(options.interactive, `${method} options.interactive`);
  if (options.timeOut !== undefined) assertNonNegativeNumber(options.timeOut, `${method} options.timeOut`);

  const executeAsModal = requireCoreMethod(core, "executeAsModal");
  const session = callbacks.openModalSession(context?.operationId);
  const result = Promise.resolve().then(() =>
    executeAsModal.call(
      core,
      async (nativeContext: unknown, descriptor: unknown) => {
        const native = assertObject(nativeContext, `${method} executionContext`);
        let contexts = modalContexts.get(callbacks);
        if (!contexts) {
          contexts = new Map();
          modalContexts.set(callbacks, contexts);
        }
        contexts.set(session.sessionId, native);
        const cancelSubscriptionId = `photoshop.core.modal-cancel:${session.sessionId}`;
        callbacks.registerSubscription(cancelSubscriptionId, () => {
          native.onCancel = undefined;
        });
        native.onCancel = (event?: unknown) => {
          const nativeEvent = event && typeof event === "object"
            && typeof (event as { readonly reason?: unknown }).reason === "string"
            ? [{ reason: (event as { readonly reason: string }).reason }]
            : [];
          void Promise.resolve().then(() => callbacks.invoke(cancelReference, nativeEvent, {
            mode: "listener",
            subscriptionId: cancelSubscriptionId,
            sessionId: session.sessionId,
            ...(context?.operationId === undefined ? {} : { parentOperationId: context.operationId })
          })).catch(() => undefined);
        };
        try {
          return await session.invoke(targetReference, [
            { isCancelled: Boolean(native.isCancelled) },
            descriptor
          ]);
        } finally {
          await callbacks.unregisterSubscription(cancelSubscriptionId);
          contexts.delete(session.sessionId);
        }
      },
      options
    )
  );
  const modalSubscriptionId = `photoshop.core.modal:${session.sessionId}`;
  let settled = false;
  let modalPromise = Promise.resolve<unknown>(undefined);
  callbacks.registerSubscription(modalSubscriptionId, async () => {
    if (settled) return;
    try {
      await modalPromise;
    } catch {
      // release-all waits for native finally, while the original request owns the modal error.
    }
  });
  modalPromise = Promise.resolve(result).finally(async () => {
    settled = true;
    await callbacks.unregisterSubscription(modalSubscriptionId);
    await session.close();
  });
  return modalPromise;
}

function dispatchModalHostControl(
  args: readonly unknown[],
  method: PhotoshopCoreInternalMethodName,
  context?: UxpDispatchContext
): unknown {
  const callbacks = requireCallbackContext(context, method);
  const sessionId = context?.modalSessionId;
  const native = sessionId === undefined ? undefined : modalContexts.get(callbacks)?.get(sessionId);
  if (!native || callbacks.activeModalSessionId !== sessionId) {
    throw coreRemoteError(
      "PhotoshopCoreModalSessionError",
      `${method} is only available from the active executeAsModal callback.`,
      "ERR_PHOTOSHOP_CORE_MODAL_SESSION"
    );
  }
  const hostControl = assertObject(native.hostControl, `${method} hostControl`);
  switch (method) {
    case "modal.reportProgress": {
      const options = expectOptions(args, method);
      assertKnownKeys(options, ["value", "commandName"], `${method} options`);
      if (options.value !== undefined) {
        const value = assertFiniteNumber(options.value, `${method} options.value`);
        if (value < 0 || value > 1) throw new RangeError(`${method} options.value must be between 0 and 1.`);
      }
      if (options.commandName !== undefined) assertString(options.commandName, `${method} options.commandName`);
      return callObjectMethod(native, "reportProgress", [options], method);
    }
    case "modal.suspendHistory": {
      const options = expectOptions(args, method);
      assertKnownKeys(options, ["documentID", "name"], `${method} options`);
      assertPositiveInteger(options.documentID, `${method} options.documentID`);
      assertNonEmptyString(options.name, `${method} options.name`);
      return resolveResult(callObjectMethod(hostControl, "suspendHistory", [options], method), (value) => {
        const result = assertObject(value, `${method} result`);
        return { historySuspensionID: assertNonNegativeNumber(result.historySuspensionID, `${method} result.historySuspensionID`) };
      });
    }
    case "modal.resumeHistory": {
      expectArgsRange(args, 1, 2, method);
      const suspension = assertObject(args[0], `${method} suspension`);
      assertKnownKeys(suspension, ["historySuspensionID", "finalName"], `${method} suspension`);
      assertNonNegativeNumber(suspension.historySuspensionID, `${method} suspension.historySuspensionID`);
      if (suspension.finalName !== undefined) assertString(suspension.finalName, `${method} suspension.finalName`);
      const commit = args[1] === undefined ? undefined : assertBoolean(args[1], `${method} commit`);
      return resolveResult(callObjectMethod(hostControl, "resumeHistory", [suspension, commit], method), () => undefined);
    }
    case "modal.registerAutoCloseDocument":
    case "modal.unregisterAutoCloseDocument": {
      expectArgs(args, 1, method);
      const documentID = assertPositiveInteger(args[0], `${method} documentID`);
      return resolveResult(callObjectMethod(hostControl, method.slice("modal.".length), [documentID], method), () => undefined);
    }
  }
}

function dispatchCalculateDialogSize(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["preferredSize", "identifier", "minimumSize"], `${method} options`);
  assertSize(options.preferredSize, `${method} options.preferredSize`);
  if (options.minimumSize !== undefined) {
    assertSize(options.minimumSize, `${method} options.minimumSize`);
  }
  if (options.identifier !== undefined) {
    assertString(options.identifier, `${method} options.identifier`);
  }
  return resolveResult(callCore(core, "calculateDialogSize", [options]), (value) =>
    normalizeSize(value, `${method} result`)
  );
}

function dispatchConvertColor(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgs(args, 2, method);
  const sourceColor = assertObject(args[0], `${method} sourceColor`);
  assertString(sourceColor._obj, `${method} sourceColor._obj`);
  const targetModel = assertColorConversionModel(args[1], `${method} targetModel`);
  return resolveResult(callCore(core, "convertColor", [sourceColor, targetModel]), (value) =>
    assertObject(value, `${method} result`)
  );
}

function dispatchConvertGlobalToLocal(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgs(args, 2, method);
  const target = assertString(args[0], `${method} target`);
  const location = assertPoint(args[1], `${method} location`);
  return resolveResult(callCore(core, "convertGlobalToLocal", [target, location]), (value) =>
    normalizePoint(value, method)
  );
}

function dispatchCreateTemporaryDocument(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName,
  context?: UxpDispatchContext
): Promise<unknown> {
  const options = expectDocumentOptions(args, method);
  assertKnownKeys(options, ["documentID"], `${method} options`);
  throwIfAborted(context?.signal, method);
  const owner = getTemporaryDocumentOwner(context);
  requireCoreMethod(core, "createTemporaryDocument");
  return executeCoreMutation(core, method, () => callCore(core, "createTemporaryDocument", [options]), context).then(
    async (value) => {
      const result = normalizeTemporaryDocument(value, method);
      const documentID = result.documentID as number;
      owner.register(
        documentID,
        () => callCore(core, "deleteTemporaryDocument", [{ documentID }]) as void | Promise<void>,
        (deleteNative) => executeCoreMutation(
          core,
          "core.deleteTemporaryDocument.cleanup",
          deleteNative
        )
      );
      if (context?.signal?.aborted) {
        await owner.delete(documentID, (deleteNative) => executeCoreMutation(
          core,
          "core.deleteTemporaryDocument.abort-cleanup",
          deleteNative,
          context
        ));
        throw coreRemoteError(
          "PhotoshopCoreOperationAbortedError",
          `${method} was aborted after Photoshop created temporary document ${documentID}; the document was deleted.`,
          "ERR_PHOTOSHOP_CORE_OPERATION_ABORTED"
        );
      }
      return result;
    }
  );
}

function dispatchDeleteTemporaryDocument(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName,
  context?: UxpDispatchContext
): Promise<void> {
  const options = expectDocumentOptions(args, method);
  assertKnownKeys(options, ["documentID"], `${method} options`);
  const documentID = options.documentID as number;
  return getTemporaryDocumentOwner(context).delete(
    documentID,
    (deleteNative) => executeCoreMutation(core, method, deleteNative, context)
  ).then((result) => {
    if (result === "not-owned") {
      throw coreRemoteError(
        "PhotoshopCoreTemporaryDocumentOwnershipError",
        `Temporary document ${documentID} is not owned by this bridge.`,
        "ERR_PHOTOSHOP_CORE_TEMPORARY_DOCUMENT_NOT_OWNED"
      );
    }
  });
}

function dispatchEndModalToolState(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgs(args, 1, method);
  const commit = assertBoolean(args[0], `${method} commit`);
  return resolveResult(callCore(core, "endModalToolState", [commit]), () => undefined);
}

function dispatchActiveTool(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgs(args, 0, method);
  return resolveResult(callCore(core, "getActiveTool"), (value) => normalizeActiveTool(value, method));
}

function dispatchObjectQuery(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getCPUInfo" | "core.getGPUInfo" | "core.getPluginInfo"
): unknown {
  expectArgs(args, 0, method);
  return resolveResult(callCore(core, method.slice("core.".length)), (value) =>
    assertObject(value, `${method} result`)
  );
}

function dispatchDisplayConfiguration(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgsRange(args, 0, 1, method);
  const options = args.length === 0 ? {} : assertObject(args[0], `${method} options`);
  assertKnownKeys(options, ["physicalResolution"], `${method} options`);
  if (options.physicalResolution !== undefined) {
    assertBoolean(options.physicalResolution, `${method} options.physicalResolution`);
  }
  return resolveResult(callCore(core, "getDisplayConfiguration", [options]), (value) => {
    if (!Array.isArray(value)) {
      throw new Error(`${method} returned a non-array value.`);
    }
    return value as unknown[];
  });
}

function dispatchMenuCommandState(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectMenuCommandOptions(args, method);
  return resolveResult(callCore(core, "getMenuCommandState", [options]), (value) =>
    normalizeMenuState(value, method)
  );
}

function dispatchMenuCommandTitle(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["commandID", "menuID", "scheduling"], `${method} options`);
  const hasCommand = typeof options.commandID === "number";
  const hasMenu = typeof options.menuID === "number";
  if (hasCommand === hasMenu) {
    throw new Error(`${method} options must contain exactly one of commandID or menuID.`);
  }
  assertInteger(hasCommand ? options.commandID : options.menuID, `${method} option id`);
  assertOptionalScheduling(options.scheduling, `${method} options.scheduling`);
  return resolveResult(callCore(core, "getMenuCommandTitle", [options]), (value) =>
    normalizeMenuTitle(value, method)
  );
}

function dispatchPerformMenuCommand(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectMenuCommandOptions(args, method);
  // Do not wrap menu dispatch in executeAsModal. A menu item may enter its own modal scope or invoke
  // another plugin; an outer bridge-owned modal scope changes native command availability.
  return resolveResult(callCore(core, "performMenuCommand", [options]), (value) =>
    normalizeMenuCommandResult(value, method)
  );
}

function dispatchRedrawDocument(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName,
  context?: UxpDispatchContext
): Promise<number> {
  const options = expectDocumentOptions(args, method);
  assertKnownKeys(options, ["documentID"], `${method} options`);
  if (assertFiniteNumber(core.apiVersion, "photoshop.core.apiVersion") < 2) {
    throw coreRemoteError(
      "PhotoshopCoreUnsupportedError",
      "photoshop.core.redrawDocument requires DOM apiVersion 2.",
      "ERR_PHOTOSHOP_CORE_UNSUPPORTED"
    );
  }
  requireCoreMethod(core, "redrawDocument");
  return executeCoreMutation(core, method, () => callCore(core, "redrawDocument", [options]), context).then(
    (value) => assertNonNegativeNumber(value, `${method} result`)
  );
}

function dispatchSetExecutionMode(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["enableErrorStacktraces", "logRejections"], `${method} options`);
  if (options.enableErrorStacktraces === undefined && options.logRejections === undefined) {
    throw new Error(`${method} options must set enableErrorStacktraces or logRejections.`);
  }
  if (options.enableErrorStacktraces !== undefined) {
    assertBoolean(options.enableErrorStacktraces, `${method} options.enableErrorStacktraces`);
  }
  if (options.logRejections !== undefined) {
    assertBoolean(options.logRejections, `${method} options.logRejections`);
  }
  return resolveResult(callCore(core, "setExecutionMode", [options]), () => undefined);
}

function dispatchSetUserIdleTime(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  expectArgs(args, 1, method);
  const idleTime = assertNonNegativeNumber(args[0], `${method} idleTime`);
  return resolveResult(callCore(core, "setUserIdleTime", [idleTime]), () => undefined);
}

function dispatchShowAlert(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["message"], `${method} options`);
  assertString(options.message, `${method} options.message`);
  return resolveResult(callCore(core, "showAlert", [options]), () => undefined);
}

function dispatchSuppressResizeGripper(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["type", "target", "value"], `${method} options`);
  if (assertString(options.type, `${method} options.type`) !== "panel") {
    throw new Error(`${method} options.type must be panel.`);
  }
  assertString(options.target, `${method} options.target`);
  assertBoolean(options.value, `${method} options.value`);
  return resolveResult(callCore(core, "suppressResizeGripper", [options]), () => undefined);
}

function dispatchHistorySuspended(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: PhotoshopCoreMethodName
): unknown {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["documentID"], `${method} options`);
  assertPositiveInteger(options.documentID, `${method} options.documentID`);
  return resolveResult(callCore(core, "historySuspended", [options]), (value) =>
    assertBoolean(value, `${method} result`)
  );
}

function dispatchLayerGroupContents(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getLayerGroupContents" | "core.getLayerGroupContentsSync"
): unknown {
  const options = expectDocumentOptions(args, method);
  assertKnownKeys(options, ["documentID", "layerID"], `${method} options`);
  assertPositiveInteger(options.layerID, `${method} options.layerID`);
  return resolveResult(callCore(core, method.slice("core.".length), [options]), (value) =>
    normalizeLayerTreeList(value, method)
  );
}

function dispatchLayerTree(
  core: PhotoshopCoreHost,
  args: readonly unknown[],
  method: "core.getLayerTree" | "core.getLayerTreeSync"
): unknown {
  const options = expectDocumentOptions(args, method);
  assertKnownKeys(options, ["documentID"], `${method} options`);
  return resolveResult(callCore(core, method.slice("core.".length), [options]), (value) =>
    normalizeLayerTreeList(value, method)
  );
}

function getTemporaryDocumentOwner(
  context: UxpDispatchContext | undefined
): ReturnType<typeof createTemporaryDocumentOwner> {
  if (!context) return temporaryDocumentOwner;
  const existing = temporaryOwners.get(context.callbacks);
  if (existing) return existing;
  const owner = createTemporaryDocumentOwner(temporaryDocumentOptions);
  temporaryOwners.set(context.callbacks, owner);
  const callbacks = context.callbacks;
  callbacks.registerSubscription(TEMPORARY_DOCUMENT_CLEANUP_SUBSCRIPTION_ID, async () => {
    await owner.destroy();
    if (temporaryOwners.get(callbacks) === owner) {
      temporaryOwners.delete(callbacks);
    }
  });
  return owner;
}

function throwIfAborted(signal: AbortSignal | undefined, method: string): void {
  if (signal?.aborted) {
    throw coreRemoteError(
      "PhotoshopCoreOperationAbortedError",
      `${method} was aborted before the native Photoshop call.`,
      "ERR_PHOTOSHOP_CORE_OPERATION_ABORTED"
    );
  }
}

function requireCallbackContext(context: UxpDispatchContext | undefined, method: string): UxpCallbackBridge {
  if (!context) {
    throw coreRemoteError(
      "PhotoshopCoreCallbackContextError",
      `${method} requires an active bridge callback context.`,
      "ERR_PHOTOSHOP_CORE_CALLBACK_CONTEXT"
    );
  }
  return context.callbacks;
}

function assertNonEmptyString(value: unknown, label: string): string {
  return assertString(value, label);
}

function assertCallbackReference(value: unknown, label: string): BridgeCallbackReference {
  if (!isBridgeCallbackReference(value) || value.callbackId.length === 0) {
    throw new Error(`${label} must be a bridge callback reference.`);
  }
  return value;
}

function normalizeEvents(value: unknown, method: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${method} events must be a non-empty array.`);
  }
  return [...new Set(value.map((event, index) => assertString(event, `${method} events[${index}]`)))].sort();
}

function notificationRegistrationKey(
  group: string,
  events: readonly string[],
  callbackId: string
): string {
  return JSON.stringify([group, events, callbackId]);
}

function callObjectMethod(
  owner: Record<string, unknown>,
  method: string,
  args: readonly unknown[],
  label: string
): unknown {
  const target = owner[method];
  if (typeof target !== "function") {
    throw coreRemoteError(
      "PhotoshopCoreUnsupportedError",
      `${label} is unavailable in this Photoshop host.`,
      "ERR_PHOTOSHOP_CORE_UNSUPPORTED"
    );
  }
  return target.apply(owner, [...args]);
}

function expectMenuCommandOptions(
  args: readonly unknown[],
  method: string
): Record<string, unknown> {
  const options = expectOptions(args, method);
  assertKnownKeys(options, ["commandID", "scheduling"], `${method} options`);
  assertInteger(options.commandID, `${method} options.commandID`);
  assertOptionalScheduling(options.scheduling, `${method} options.scheduling`);
  return options;
}

const CORE_METHOD_MIN_VERSIONS: Readonly<Record<string, string>> = {
  addNotificationListener: "23.3",
  calculateDialogSize: "22.5",
  convertColor: "23.0",
  convertGlobalToLocal: "26.0",
  createTemporaryDocument: "23.0",
  deleteTemporaryDocument: "23.0",
  endModalToolState: "22.5",
  executeAsModal: "22.5",
  getActiveTool: "22.5",
  getCPUInfo: "23.1",
  getDisplayConfiguration: "23.0",
  getGPUInfo: "23.1",
  getLayerGroupContents: "23.1",
  getLayerGroupContentsSync: "23.1",
  getLayerTree: "23.1",
  getLayerTreeSync: "23.1",
  getMenuCommandState: "22.5",
  getMenuCommandTitle: "22.5",
  getPluginInfo: "23.2",
  getUserIdleTime: "23.3",
  historySuspended: "23.1",
  isModal: "23.1",
  performMenuCommand: "22.5",
  redrawDocument: "24.1",
  removeNotificationListener: "23.0",
  setExecutionMode: "23.2",
  setUserIdleTime: "23.3",
  showAlert: "22.5",
  suppressResizeGripper: "23.1",
  translateUIString: "22.5"
};

function callCore(core: PhotoshopCoreHost, method: string, args: readonly unknown[] = []): unknown {
  return requireCoreMethod(core, method).apply(core, [...args]);
}

function requireCoreMethod(
  core: PhotoshopCoreHost,
  method: string
): (...values: unknown[]) => unknown {
  const target = core[method];
  if (typeof target !== "function") {
    const minimumVersion = CORE_METHOD_MIN_VERSIONS[method] ?? "a supported version";
    throw coreRemoteError(
      "PhotoshopCoreUnsupportedError",
      `photoshop.core.${method} requires Photoshop ${minimumVersion} or newer.`,
      "ERR_PHOTOSHOP_CORE_UNSUPPORTED"
    );
  }
  return target as (...values: unknown[]) => unknown;
}

function executeCoreMutation<T>(
  core: PhotoshopCoreHost,
  commandName: string,
  fn: () => T | Promise<T>,
  context?: UxpDispatchContext
): Promise<T> {
  if (
    context?.modalSessionId !== undefined &&
    context.modalSessionId === context.callbacks.activeModalSessionId
  ) {
    return Promise.resolve().then(fn);
  }
  const executeAsModal = requireCoreMethod(core, "executeAsModal");
  return Promise.resolve(
    executeAsModal.call(core, async () => fn(), { commandName }) as T | Promise<T>
  );
}

function coreRemoteError(remoteName: string, remoteMessage: string, code: string): BridgeRemoteError {
  return new BridgeRemoteError({
    // RpcHost replaces this with the request envelope's operation id on the WebView side.
    operationId: "host",
    remoteName,
    remoteMessage,
    code
  });
}

function resolveResult(value: unknown, normalize: (resolved: unknown) => unknown): unknown {
  return value && typeof (value as Promise<unknown>).then === "function"
    ? (value as Promise<unknown>).then(normalize)
    : normalize(value);
}

function unsupported(method: PhotoshopCoreMethodName): never {
  throw new Error(`Unsupported photoshop core method: ${method}`);
}

export function destroyCoreAdapter(): Promise<void> {
  return temporaryDocumentOwner.destroy();
}

function getCore(): PhotoshopCoreHost {
  return require("photoshop").core;
}
