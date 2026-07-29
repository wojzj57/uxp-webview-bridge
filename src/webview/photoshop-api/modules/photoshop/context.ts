/**
 * Shared per-namespace wiring passed to the Document/Layer class factories.
 *
 * Document and Layer reference each other cyclically and share the type registry (WeakRef identity
 * caches + the declarative decode resolver), so the wiring is resolved once in `photoshop.ts` and
 * injected here. Since ADR 0009, the four bespoke decoder closures collapse into the single
 * {@link PhotoshopTypeRegistry} decode context, whose lazy call-site lookups break the
 * Document↔Layer construction-order cycle.
 */

import type { RemoteRpc } from "@webview/uxp-api/remote/index.js";
import type { BridgeCallbackReference } from "@shared/protocol.js";
import type { RemoteArgEncoder } from "@webview/uxp-api/remote/index.js";
import type { PhotoshopTypeRegistry } from "./registry.js";

/** Late-bound namespace context: the rpc client plus the shared type/value/collection registry. */
export interface PhotoshopRpc extends RemoteRpc {
  readonly activeModalSessionId?: string | undefined;
  readonly callbackScope?: object | undefined;
  retainCallback?(callback: (...args: never[]) => unknown): BridgeCallbackReference;
  releaseCallback?(reference: BridgeCallbackReference): void;
}

export interface PhotoshopCallbackOwner {
  retainCallback(callback: (...args: never[]) => unknown): BridgeCallbackReference;
  releaseCallback(reference: BridgeCallbackReference): void;
}

export function requirePhotoshopCallbackOwner(rpc: PhotoshopRpc): PhotoshopCallbackOwner & object {
  const candidate = rpc.callbackScope ?? rpc;
  if (
    typeof (candidate as Partial<PhotoshopCallbackOwner>).retainCallback !== "function" ||
    typeof (candidate as Partial<PhotoshopCallbackOwner>).releaseCallback !== "function"
  ) {
    throw new Error("This bridge RPC transport does not support callbacks.");
  }
  return candidate as PhotoshopCallbackOwner & object;
}

export interface PhotoshopContext {
  readonly rpc: PhotoshopRpc;
  readonly registry: PhotoshopTypeRegistry;
  readonly argEncoders: readonly RemoteArgEncoder[];
}
