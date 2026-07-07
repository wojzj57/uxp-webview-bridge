# Unified remote-reference envelope + reusable UXP handle registry

Stateful DOM RemoteObjects must be identifiable across the bridge and passable between each other (`layer.parent` → Layer, `doc.layers` → Layers, `layer.document` → Document, `doc.duplicateLayers(layers, targetDoc)`). Rather than the XMP approach of a module-private reference kind and a handle registry hand-coded inside one host file, we adopt a unified reference envelope and a reusable handle-registry utility.

- **Reference envelope:** a single shape `{ kind: "uxp.remote.ref", type: string, id: string }`, reusing the existing `BridgeRemoteReference` base type in `src/shared/types.ts`. `type` is the DOM class name (`"Document"`, `"Layer"`, `"Layers"`, ...).
- **Handle registry:** a generic UXP-side utility (`createRemoteHandleRegistry()`) owning id allocation, get, dispose, TTL touch, and prune — one implementation. Each module adapter holds its **own** registry instance, so handle id spaces stay isolated per module while the lifecycle logic is written once.
- **WebView side:** the `RemoteClass` base holds the reference, encodes RemoteObject args into reference envelopes, and decodes returned reference envelopes back into the correct RemoteObject subclass instances.

## Considered Options

- **Unified envelope + reusable registry utility, per-module instances (chosen):** lifecycle logic written once; cross-object/cross-type reference passing works naturally; matches the "generic RemoteClass" direction where the reference layer is its foundation. Cost: introduces a shared/uxp infrastructure layer beyond any single module.
- **Per-module private references (XMP-style):** simplest and symmetric with XMP, but duplicates the entire handle-lifecycle implementation per module and makes passing e.g. a Layer reference into another module impossible without ad-hoc glue.

## Consequences

- A new shared/uxp infrastructure layer is added. It must stay minimal: the generic registry manages only id allocation and handle lifecycle (TTL/prune/get/dispose). It must not encode any Photoshop/DOM semantics — those live in the module adapters. Guard against it becoming a god object.
- Reference identity dedup is handled per ADR 0005: the generic registry exposes `getOrCreate(key, factory)` and stays semantic-free; the *key* is computed by the domain module (e.g. `Layer:${id}`), and WebView `===` identity is preserved via a `WeakRef` instance cache.
- The envelope `kind` is a single constant `"uxp.remote.ref"` shared across stateful modules; `type` discriminates the DOM class. This differs from XMP's `"uxp.xmp.ref"`, which is left as-is (not migrated) unless a future task justifies it.
