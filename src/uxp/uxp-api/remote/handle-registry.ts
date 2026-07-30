import { REMOTE_REFERENCE_KIND, type RemoteReference } from "@shared/uxp-api/remote-protocol.js";

/**
 * Generic UXP-side handle registry for stateful remote objects.
 *
 * Owns only id allocation and handle lifecycle (get / dedup / dispose / TTL prune). It carries no
 * Photoshop / XMP / DOM semantics — the owning module computes dedup keys and interprets values.
 * Each module adapter holds its own instance so handle id spaces stay isolated per module.
 *
 * See docs/adr/0004-shared-remote-reference-and-handle-registry.md and
 * docs/adr/0005-identity-dedup-and-object-classification.md.
 */
export interface RemoteHandleRegistry {
  /**
   * Register a value under a fresh handle id and return its reference envelope.
   * Prefer {@link getOrCreate} when the same real object may be registered more than once.
   */
  register(type: string, value: unknown): RemoteReference;
  /**
   * Return the existing reference for `key`, or register `factory()` under a new id keyed by `key`.
   * Enables identity dedup: the caller derives a stable key from the real object's domain id.
   */
  getOrCreate(type: string, key: string, factory: () => unknown): RemoteReference;
  /** Resolve a reference to its stored value, asserting its `type`, and refresh its TTL. */
  resolve(reference: RemoteReference, expectedType: string): unknown;
  /** Drop the handle for `reference`, if present. */
  dispose(reference: RemoteReference): void;
  /** Remove handles untouched for longer than the configured TTL. */
  prune(): void;
  /** Drop every handle. */
  clear(): void;
}

export interface RemoteHandleRegistryOptions {
  /** Immutable owning Bridge session. */
  readonly bridgeSessionId: string;
  /** Milliseconds a handle may stay untouched before {@link RemoteHandleRegistry.prune} removes it. */
  readonly ttlMs?: number;
  /** Injected clock, primarily for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface RegisteredHandle {
  readonly type: string;
  readonly value: unknown;
  readonly key?: string;
  touchedAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export function createRemoteHandleRegistry(
  options: RemoteHandleRegistryOptions = { bridgeSessionId: "bridge.direct" }
): RemoteHandleRegistry {
  const bridgeSessionId = options.bridgeSessionId;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  const handles = new Map<string, RegisteredHandle>();
  const keyToId = new Map<string, string>();
  let nextHandleId = 1;

  function allocateId(type: string): string {
    return `${type}:${now()}:${nextHandleId++}`;
  }

  function makeReference(type: string, id: string): RemoteReference {
    return {
      kind: REMOTE_REFERENCE_KIND,
      type,
      id,
      bridgeSessionId
    };
  }

  function register(type: string, value: unknown): RemoteReference {
    const id = allocateId(type);
    handles.set(id, { type, value, touchedAt: now() });
    return makeReference(type, id);
  }

  function getOrCreate(type: string, key: string, factory: () => unknown): RemoteReference {
    const compositeKey = `${type}\u0000${key}`;
    const existingId = keyToId.get(compositeKey);
    if (existingId !== undefined) {
      const existing = handles.get(existingId);
      if (existing) {
        existing.touchedAt = now();
        return makeReference(type, existingId);
      }
      keyToId.delete(compositeKey);
    }

    const id = allocateId(type);
    handles.set(id, { type, value: factory(), key: compositeKey, touchedAt: now() });
    keyToId.set(compositeKey, id);
    return makeReference(type, id);
  }

  function resolve(reference: RemoteReference, expectedType: string): unknown {
    assertReferenceOwner(reference);
    if (reference.kind !== REMOTE_REFERENCE_KIND || reference.type !== expectedType || typeof reference.id !== "string") {
      throw new Error(`Invalid ${expectedType} reference.`);
    }

    const handle = handles.get(reference.id);
    if (!handle || handle.type !== expectedType) {
      throw new Error(`Unknown ${expectedType} reference: ${reference.id}`);
    }

    handle.touchedAt = now();
    return handle.value;
  }

  function dispose(reference: RemoteReference): void {
    assertReferenceOwner(reference);
    remove(reference.id);
  }

  function prune(): void {
    const cutoff = now();
    for (const [id, handle] of handles) {
      if (cutoff - handle.touchedAt > ttlMs) {
        remove(id);
      }
    }
  }

  function clear(): void {
    for (const id of [...handles.keys()]) remove(id);
    keyToId.clear();
  }

  function remove(id: string): void {
    const handle = handles.get(id);
    if (!handle) {
      return;
    }
    handles.delete(id);
    if (handle.key !== undefined && keyToId.get(handle.key) === id) {
      keyToId.delete(handle.key);
    }
  }

  function assertReferenceOwner(reference: RemoteReference): void {
    if (reference.bridgeSessionId === bridgeSessionId) return;
    const error = new Error("Remote reference belongs to a stale Bridge session.") as Error & {
      code: string;
    };
    error.code = "ERR_BRIDGE_STALE_REFERENCE";
    throw error;
  }

  return { register, getOrCreate, resolve, dispose, prune, clear };
}
