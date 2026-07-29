# `PsLayerComp`

Remote layer comp.

Read-only: `typename`, `id`, `docId`, `parent`, `selected`. Writable queued: `name`, nullable `comment`, `appearance`, `position`, `visibility`, `childComp`.

Methods: `apply`, `duplicate`, `recapture(options?, layers?)`, `remove`, `resetLayerComp`, `batchGet`, `batchSet`, `dispose`.

Use `batchSet` for explicit multi-property completion. Recapture options independently select visibility, position, appearance, and child-comp state.
