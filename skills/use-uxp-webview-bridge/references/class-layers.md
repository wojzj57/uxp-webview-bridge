# `Layers`

Read-only array-like snapshot of `PsLayer` ids. It has `typename: "Layers"`.

- `getByName(name) -> PsLayer | null`
- `add({ name?, opacity?, blendMode? }) -> PsLayer`

Indexing/iteration lazily resolves stable layer proxies. The same real layer normally preserves `===` identity. Re-await the owning `document.layers`, `document.activeLayers`, or `layer.layers` after mutations; snapshots do not refresh and stale members can reject.
