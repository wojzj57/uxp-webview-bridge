/**
 * WebView-side identity cache keyed by reference id.
 *
 * Guarantees the same remote reference id resolves to the same instance (`===`) while allowing
 * garbage collection of instances whose UXP-side object is gone: entries are held via `WeakRef`
 * and cleaned up through a `FinalizationRegistry`. See
 * docs/adr/0005-identity-dedup-and-object-classification.md.
 */
export interface IdentityCache<T extends object> {
  /** Return the cached instance for `referenceId`, or create, cache, and return one via `factory`. */
  getOrCreate(referenceId: string, factory: () => T): T;
}

export function createIdentityCache<T extends object>(): IdentityCache<T> {
  const entries = new Map<string, WeakRef<T>>();
  const finalizer = new FinalizationRegistry<string>((referenceId) => {
    // Only delete if the current entry is the collected one (guard against a re-added instance).
    const ref = entries.get(referenceId);
    if (ref && ref.deref() === undefined) {
      entries.delete(referenceId);
    }
  });

  function getOrCreate(referenceId: string, factory: () => T): T {
    const existing = entries.get(referenceId)?.deref();
    if (existing !== undefined) {
      return existing;
    }

    const created = factory();
    entries.set(referenceId, new WeakRef(created));
    finalizer.register(created, referenceId);
    return created;
  }

  return { getOrCreate };
}
