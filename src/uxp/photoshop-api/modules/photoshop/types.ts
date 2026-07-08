/**
 * Host-side types for the `photoshop` module.
 *
 * These describe the *minimal* runtime surface the adapter touches on `require('photoshop')` — the
 * app entry, the modal-execution core, and the structural shapes of the Document/Layer DOM objects
 * it reads/mutates. Following the xmp precedent (`UxpXmpHostModule`), a narrow local shape is used
 * rather than the full ambient Adobe `photoshop` types, so the adapter is decoupled from the whole
 * DOM surface and only asserts what it actually calls. Method-name types come from RFC-0004.
 */

import type { PhotoshopProtocolMethodName } from "@shared/photoshop-api/photoshop-protocol.js";

/** All method names dispatched by this module (the full protocol vocabulary from RFC-0004). */
export type PhotoshopMethodName = PhotoshopProtocolMethodName;

/** Concrete remote class names owned by this module's handle registry. */
export type PhotoshopHandleType = "Document" | "Layer" | "Channel";

/** Options passed to `core.executeAsModal`. */
export interface ExecuteAsModalOptions {
  readonly commandName: string;
}

/** The modal-execution surface of `require('photoshop').core`. */
export interface PhotoshopCore {
  executeAsModal<T>(
    targetFunction: (executionContext: unknown) => Promise<T>,
    options: ExecuteAsModalOptions
  ): Promise<T>;
}

/**
 * Structural Document shape the adapter reads/mutates. Intentionally loose (`unknown`-typed
 * members accessed dynamically), matching how the xmp host treats native handles as
 * `Record<string, unknown>`. The real object is Adobe's `Document`.
 */
export interface PhotoshopDocumentLike {
  readonly id: number;
  [member: string]: unknown;
}

/** Structural Layer shape the adapter reads/mutates. The real object is Adobe's `Layer`. */
export interface PhotoshopLayerLike {
  readonly id: number;
  [member: string]: unknown;
}

/**
 * Structural Channel shape the adapter reads/mutates. Unlike Document/Layer, Channel has NO
 * native `id` — remote identity is minted per read (non-deduped, RFC-0011 Open Question #1).
 * The real object is Adobe's `Channel`.
 */
export interface PhotoshopChannelLike {
  [member: string]: unknown;
}

/** The app entry surface of `require('photoshop').app`. */
export interface PhotoshopApp {
  readonly activeDocument: PhotoshopDocumentLike;
  readonly documents: ArrayLike<PhotoshopDocumentLike>;
  open(...args: unknown[]): Promise<PhotoshopDocumentLike> | PhotoshopDocumentLike;
  [member: string]: unknown;
}

/**
 * The low-level action surface of `require('photoshop').action`. `batchPlay` takes an array of
 * opaque action descriptors and returns an array of opaque result descriptors — both plain JSON,
 * passed through verbatim (ADR 0010). The adapter does not model descriptor internals.
 */
export interface PhotoshopActionModule {
  batchPlay(
    commands: readonly unknown[],
    options?: Record<string, unknown>
  ): Promise<readonly unknown[]>;
}

/** The subset of `require('photoshop')` the adapter uses. */
export interface PhotoshopHostModule {
  readonly app: PhotoshopApp;
  readonly core: PhotoshopCore;
  readonly action: PhotoshopActionModule;
}
