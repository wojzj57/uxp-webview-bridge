/**
 * UXP host adapter for the `photoshop.imaging` module (RFC-0010 Part 2, ADR 0011).
 *
 * Owns the real `require('photoshop').imaging` calls. It runs a self-contained handle registry for
 * the transient {@link PhotoshopImageDataLike} objects it produces (ADR 0004 wants one registry per
 * module adapter; imaging handles are resource handles with a shorter, TTL-pruned lifecycle than the
 * persistent Document/Layer handles owned by the photoshop module). Every pixel-producing call runs
 * inside `core.executeAsModal` (ADR 0007), registers the returned imageData under a fresh handle id,
 * and hands the WebView back a reference + an immutable metadata value snapshot (never the bytes).
 * Bytes only cross on an explicit `imaging.imageData.getData`, enveloped through the shared binary
 * transport layer (ADR 0011).
 *
 * `src/uxp` must never import `src/webview` (AGENTS.md); this file depends only on the shared
 * protocol/transport and the host handle registry.
 *
 * See docs/adr/0004 (handle registry), docs/adr/0007 (executeAsModal), docs/adr/0011.
 */

import {
  bytesToTransport,
  isBinaryTransportData,
  transportToBytes,
  type BinaryTransportData
} from "@shared/uxp-api/binary-transport.js";
import {
  assertPhotoshopImagingMethodName,
  IMAGE_DATA_METADATA_VALUE_KIND,
  PHOTOSHOP_IMAGING_MODULE_ID,
  PS_IMAGE_DATA_TYPE,
  type PhotoshopImagingMethodName
} from "@shared/photoshop-api/imaging-protocol.js";
import { serializeValue } from "@shared/photoshop-api/value-objects.js";
import { isRemoteReference, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import {
  assertPhotoshopExecutionClass,
  fixedCapability,
  type UxpDispatchContext,
  type UxpModuleAdapter
} from "@uxp/module-registry.js";
import { createRemoteHandleRegistry } from "@uxp/uxp-api/remote/index.js";
import type {
  ImagingReadResultLike,
  PhotoshopImageDataLike,
  PhotoshopImagingHostModule
} from "./types.js";

declare const require: (moduleName: "photoshop") => PhotoshopImagingHostModule;

interface ImagingAdapterState {
  readonly registry: ReturnType<typeof createRemoteHandleRegistry>;
  readonly resources: Set<PhotoshopImageDataLike>;
}

function createImagingAdapterState(bridgeSessionId = "bridge.direct"): ImagingAdapterState {
  return { registry: createRemoteHandleRegistry({ bridgeSessionId }), resources: new Set() };
}

export function createImagingModuleAdapter(bridgeSessionId: string): UxpModuleAdapter {
  const state = createImagingAdapterState(bridgeSessionId);
  return {
    moduleId: PHOTOSHOP_IMAGING_MODULE_ID,
    resolveCapability: fixedCapability("photoshop.imaging", assertPhotoshopImagingMethodName),
    dispatch: (method, args, context) => dispatchImagingCall(method, args, context, state),
    destroy: () => destroyImagingHandles(state)
  };
}

const defaultImagingState = createImagingAdapterState();

export const imagingModuleAdapter: UxpModuleAdapter = {
  moduleId: PHOTOSHOP_IMAGING_MODULE_ID,
  resolveCapability: fixedCapability("photoshop.imaging", assertPhotoshopImagingMethodName),
  dispatch: (method, args, context) => dispatchImagingCall(method, args, context, defaultImagingState),
  destroy: () => destroyImagingHandles(defaultImagingState)
};

export function dispatchImagingCall(
  method: string,
  args: readonly unknown[],
  context?: UxpDispatchContext,
  state: ImagingAdapterState = defaultImagingState
): unknown {
  assertPhotoshopImagingMethodName(method);
  state.registry.prune();

  switch (method) {
    case "imaging.getPixels":
      return dispatchGetPixels(args, context, state);
    case "imaging.getLayerMask":
      return dispatchRead("imaging.getLayerMask", "getLayerMask", args, context, state);
    case "imaging.getSelection":
      return dispatchRead("imaging.getSelection", "getSelection", args, context, state);
    case "imaging.putPixels":
      return dispatchPut("imaging.putPixels", "putPixels", args, context, state);
    case "imaging.putLayerMask":
      return dispatchPut("imaging.putLayerMask", "putLayerMask", args, context, state);
    case "imaging.putSelection":
      return dispatchPut("imaging.putSelection", "putSelection", args, context, state);
    case "imaging.createImageDataFromBuffer":
      return dispatchCreateImageDataFromBuffer(args, context, state);
    case "imaging.encodeImageData":
      return dispatchEncodeImageData(args, state);
    case "imaging.imageData.getData":
      return dispatchGetData(args, state);
    case "imaging.imageData.dispose":
      return dispatchDispose(args, state);
    default:
      return unsupported(method);
  }
}

export async function destroyImagingHandles(state: ImagingAdapterState = defaultImagingState): Promise<void> {
  const failures: unknown[] = [];
  await Promise.all([...state.resources].map(async (resource) => {
    try {
      await resource.dispose();
    } catch (error) {
      failures.push(error);
    }
  }));
  state.resources.clear();
  state.registry.clear();
  if (failures.length > 0) {
    const error = new Error(`Failed to dispose ${failures.length} Photoshop image resource(s).`) as Error & {
      failures: readonly unknown[];
    };
    error.failures = failures;
    throw error;
  }
}

// ---------------------------------------------------------------------------- reads

/**
 * `getPixels` returns `{ imageData, sourceBounds, level }`. The imageData is registered as a handle;
 * `sourceBounds`/`level` are copied through verbatim so the WebView result mirrors Adobe's shape.
 */
function dispatchGetPixels(args: readonly unknown[], context: UxpDispatchContext | undefined, state: ImagingAdapterState): Promise<unknown> {
  const options = expectOptions(args, "imaging.getPixels");
  return executeAsModal("imaging.getPixels", () => getImaging().getPixels(options), context).then((result) => {
    const read = asReadResult(result, "imaging.getPixels");
    return {
      ...serializeImageData(read.imageData, state),
      sourceBounds: read.sourceBounds,
      level: read.level
    };
  });
}

/** `getLayerMask` / `getSelection` return `{ imageData, sourceBounds }`. */
function dispatchRead(
  method: PhotoshopImagingMethodName,
  apiMethod: "getLayerMask" | "getSelection",
  args: readonly unknown[],
  context: UxpDispatchContext | undefined,
  state: ImagingAdapterState
): Promise<unknown> {
  const options = expectOptions(args, method);
  return executeAsModal(method, () => getImaging()[apiMethod](options), context).then((result) => {
    const read = asReadResult(result, method);
    return { ...serializeImageData(read.imageData, state), sourceBounds: read.sourceBounds };
  });
}

// ---------------------------------------------------------------------------- writes

/**
 * `putPixels` / `putLayerMask` / `putSelection` receive options whose `imageData` is a handle
 * reference; it is resolved back to the real object before the modal put. The bytes never crossed —
 * only the handle id did.
 */
function dispatchPut(
  method: PhotoshopImagingMethodName,
  apiMethod: "putPixels" | "putLayerMask" | "putSelection",
  args: readonly unknown[],
  context: UxpDispatchContext | undefined,
  state: ImagingAdapterState
): Promise<unknown> {
  const options = expectOptions(args, method);
  const resolved = resolveImageDataOption(options, method, state);
  return executeAsModal(method, () => getImaging()[apiMethod](resolved), context).then(() => undefined);
}

// ---------------------------------------------------------------------------- create / encode

/**
 * `createImageDataFromBuffer` decodes the incoming {@link BinaryTransportData} to a `Uint8Array`,
 * builds the real imageData inside a modal scope, and returns a fresh handle + metadata snapshot.
 */
function dispatchCreateImageDataFromBuffer(
  args: readonly unknown[],
  context: UxpDispatchContext | undefined,
  state: ImagingAdapterState
): Promise<unknown> {
  expectArgs(args, 2, 2, "imaging.createImageDataFromBuffer");
  const [transport, options] = args;
  if (!isBinaryTransportData(transport)) {
    throw new Error("imaging.createImageDataFromBuffer requires a binary transport buffer.");
  }
  const bytes = transportToBytes(transport);
  const optionsRecord = assertOptions(options, "imaging.createImageDataFromBuffer");
  return executeAsModal(
    "imaging.createImageDataFromBuffer",
    () => getImaging().createImageDataFromBuffer(bytes, optionsRecord),
    context
  ).then((imageData) => serializeImageData(imageData, state));
}

/** `encodeImageData` resolves its handle then returns the raw base64/number[] result verbatim. */
function dispatchEncodeImageData(args: readonly unknown[], state: ImagingAdapterState): Promise<number[] | string> {
  const options = expectOptions(args, "imaging.encodeImageData");
  const resolved = resolveImageDataOption(options, "imaging.encodeImageData", state);
  return getImaging().encodeImageData(resolved);
}

// ---------------------------------------------------------------------------- handle methods

/** `imaging.imageData.getData` resolves the handle, reads pixels, and envelopes the bytes. */
function dispatchGetData(args: readonly unknown[], state: ImagingAdapterState): Promise<BinaryTransportData> {
  expectArgs(args, 1, 2, "imaging.imageData.getData");
  const [reference, options] = args;
  const imageData = getImageData(reference, "imaging.imageData.getData", state);
  return Promise.resolve(imageData.getData(options)).then((data) =>
    bytesToTransport(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  );
}

/** `imaging.imageData.dispose` drops the handle and disposes the native imageData if it supports it. */
function dispatchDispose(args: readonly unknown[], state: ImagingAdapterState): Promise<void> {
  expectArgs(args, 1, 1, "imaging.imageData.dispose");
  const [reference] = args;
  if (!isRemoteReference(reference)) {
    throw new Error("imaging.imageData.dispose requires a PsImageData reference.");
  }
  // Best-effort native dispose before dropping the handle; some hosts free lazily.
  let native: PhotoshopImageDataLike | undefined;
  try {
    native = state.registry.resolve(reference, PS_IMAGE_DATA_TYPE) as PhotoshopImageDataLike;
  } catch {
    native = undefined;
  }
  const disposed = native ? Promise.resolve(native.dispose()).catch(() => undefined) : Promise.resolve();
  return disposed.then(() => {
    if (native) state.resources.delete(native);
    state.registry.dispose(reference);
    return undefined;
  });
}

// ---------------------------------------------------------------------------- serialization

/**
 * Register a native imageData under a fresh handle and return its transport form: a reference plus an
 * immutable metadata value snapshot. Each read produces a distinct buffer, so a new handle id is
 * always allocated (`register`, not `getOrCreate` — there is no stable domain id to dedup on).
 */
function serializeImageData(imageData: PhotoshopImageDataLike, state: ImagingAdapterState): {
  imageData: RemoteReference;
  metadata: unknown;
} {
  const reference = state.registry.register(PS_IMAGE_DATA_TYPE, imageData);
  state.resources.add(imageData);
  const metadata = serializeValue(IMAGE_DATA_METADATA_VALUE_KIND, imageData);
  return { imageData: reference, metadata };
}

// ---------------------------------------------------------------------------- options handling

/**
 * Replace an options bag's `imageData` reference with the resolved native object. Every put/encode
 * path carries the handle in the same field; the returned object is otherwise the caller's options
 * verbatim so Adobe honors `replace`/`targetBounds`/`commandName`/etc.
 */
function resolveImageDataOption(options: Record<string, unknown>, method: string, state: ImagingAdapterState): Record<string, unknown> {
  const reference = options.imageData;
  const imageData = getImageData(reference, method, state);
  return { ...options, imageData };
}

function getImageData(reference: unknown, method: string, state: ImagingAdapterState): PhotoshopImageDataLike {
  if (!isRemoteReference(reference)) {
    throw new Error(`${method} requires a PsImageData reference.`);
  }
  return state.registry.resolve(reference, PS_IMAGE_DATA_TYPE) as PhotoshopImageDataLike;
}

function asReadResult(result: unknown, method: string): ImagingReadResultLike {
  if (!result || typeof result !== "object" || !("imageData" in result)) {
    throw new Error(`${method} returned an unexpected result shape.`);
  }
  return result as ImagingReadResultLike;
}

function expectOptions(args: readonly unknown[], method: string): Record<string, unknown> {
  expectArgs(args, 1, 1, method);
  return assertOptions(args[0], method);
}

function assertOptions(value: unknown, method: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${method} requires an options object.`);
  }
  return value as Record<string, unknown>;
}

function expectArgs(args: readonly unknown[], minLength: number, maxLength: number, method: string): void {
  if (args.length < minLength || args.length > maxLength) {
    const range = minLength === maxLength ? `${minLength}` : `${minLength}-${maxLength}`;
    throw new Error(`${method} expects ${range} arguments.`);
  }
}

function unsupported(method: string): never {
  throw new Error(`Unsupported photoshop imaging method: ${method}`);
}

// ---------------------------------------------------------------------------- modal execution & module

function executeAsModal<T>(
  commandName: string,
  fn: () => T | Promise<T>,
  context?: UxpDispatchContext
): Promise<T> {
  assertPhotoshopExecutionClass(context, "modal-aware-mutation");
  if (
    context?.modalSessionId !== undefined &&
    context.modalSessionId === context.callbacks.activeModalSessionId
  ) {
    return Promise.resolve().then(fn);
  }
  if (context?.modalCoordinator && context.bridgeSessionId && context.signal) {
    return context.modalCoordinator.run({
      bridgeSessionId: context.bridgeSessionId,
      operationId: context.operationId,
      signal: context.signal,
      execute: () => getPhotoshop().core.executeAsModal(async () => fn(), { commandName })
    });
  }
  return getPhotoshop().core.executeAsModal(async () => fn(), { commandName });
}

function getImaging(): PhotoshopImagingHostModule["imaging"] {
  return getPhotoshop().imaging;
}

function getPhotoshop(): PhotoshopImagingHostModule {
  return require("photoshop");
}
