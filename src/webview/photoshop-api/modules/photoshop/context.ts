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
import type { PhotoshopTypeRegistry } from "./registry.js";

/** Late-bound namespace context: the rpc client plus the shared type/value/collection registry. */
export interface PhotoshopContext {
  readonly rpc: RemoteRpc;
  readonly registry: PhotoshopTypeRegistry;
}
