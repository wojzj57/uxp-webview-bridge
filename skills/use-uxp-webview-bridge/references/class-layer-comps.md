# `LayerComps`

Read-only array-like snapshot from `document.layerComps`, with `typename` and `parent`.

- `add({ name?, comment?, visibility?, position?, appearance?, childComp? })`
- `getAllByName(name) -> LayerComps`
- `removeAll()`

Each returned collection is a snapshot; re-read after mutation.
