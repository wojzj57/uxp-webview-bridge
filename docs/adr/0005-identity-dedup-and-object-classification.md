# Identity dedup by real id, and Value / RemoteObject / Collection classification

Photoshop DOM results that cross the bridge fall into three kinds, each with distinct bridge treatment. Additionally, the same real object reached via different paths must resolve to the same identity (`===`).

## Object classification

1. **Value object** — pure data, no methods, no mutable remote state. Serialized as plain JSON, never registered as a handle. E.g. `Bounds`, `histogram`, sampled `Color`. `await layer.bounds` returns a plain object.
2. **RemoteObject** — stateful, has mutating methods. Registered in the UXP handle registry, deduped by real domain id, cached on the WebView side for `===`. E.g. `Document`, `Layer`.
3. **Collection wrapper** — e.g. `Layers`. A WebView-local object with **no remote handle of its own**. It holds a snapshot array of member ids (one RPC) and lazily resolves an id into a RemoteObject only on indexed access (`layers.getByIndex(0)`), going through the identity cache.

## Identity dedup (three layers)

- **Generic registry (shared/uxp):** exposes `getOrCreate(key, factory)`; given a key, returns the existing handle or creates one via `factory`. Stays free of any Photoshop semantics (upholds ADR 0004).
- **Domain module host (uxp side):** computes the key from the real domain id — `Layer:${nativeLayer.id}`, `Document:${nativeDoc.id}` — so the same real object always yields the same key and thus the same reference id.
- **WebView RemoteClass:** caches `referenceId → RemoteObject` via `WeakRef` + `FinalizationRegistry`, so the same reference id returns the same instance (`===` holds) without leaking instances for deleted objects.

## Considered Options

- **Dedup by real id + WeakRef cache + 3-kind classification (chosen):** intuitive identity (`===` and equal `id`), no handle accumulation for the same object, registry stays semantic-free. Cost: WeakRef/FinalizationRegistry complexity; collection snapshots can go stale.
- **No dedup (opaque auto-increment ids):** simplest, registry fully semantic-free, but `===` never holds and the same layer accumulates handles; identity checks require comparing `await x.id`. Rejected: user wants `===` identity.
- **Heavyweight `Layers` RemoteObject (remote handle + remote methods):** a live remote collection. Rejected: heavier than needed; a WebView-local id-snapshot wrapper with lazy resolution is lighter and sufficient.
- **Bare `Layer[]` snapshot array:** returns all elements eagerly as RemoteObjects. Rejected in favor of the lazy id-snapshot wrapper, which avoids instantiating handles for layers never accessed.

## Consequences

- Collection snapshots are point-in-time and do NOT auto-refresh. Accessing an id whose real object no longer exists (e.g. layer deleted elsewhere) raises `BridgeRemoteError`; the user must re-fetch (`await doc.layers`) for a fresh snapshot. Auto-refreshing would require subscribing to Photoshop change events — out of scope.
- Value objects need explicit per-type serializers on the UXP side (which fields to copy); they must never be registered as handles.
- The WebView identity cache must use `WeakRef`/`FinalizationRegistry` (not a plain `Map`) to avoid pinning RemoteObjects for deleted UXP objects.
- Container equality is not preserved: two `await doc.layers` calls yield two distinct wrapper objects (`arr1 !== arr2`), but resolved elements are identity-equal (`arr1[0] === arr2[0]`).
