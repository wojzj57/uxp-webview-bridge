import type { BridgeRemoteReference } from "../types.js";

/**
 * Unified reference-envelope kind for stateful remote DOM objects (Document, Layer, XMPMeta, ...).
 *
 * A single `kind` is shared across all stateful bridge modules; the `type` field discriminates the
 * concrete remote class name. See docs/adr/0004-shared-remote-reference-and-handle-registry.md.
 */
export const REMOTE_REFERENCE_KIND = "uxp.remote.ref";

/**
 * Envelope identifying a stateful remote object across the bridge.
 *
 * `type` is the remote class name (`"XMPMeta"`, `"Document"`, `"Layer"`, ...); `id` is the
 * handle id allocated by the owning module's handle registry.
 */
export interface RemoteReference extends BridgeRemoteReference {
  readonly kind: typeof REMOTE_REFERENCE_KIND;
  readonly type: string;
  readonly id: string;
  readonly bridgeSessionId: string;
}

export function isRemoteReference(value: unknown): value is RemoteReference {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === REMOTE_REFERENCE_KIND &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { bridgeSessionId?: unknown }).bridgeSessionId === "string"
  );
}
