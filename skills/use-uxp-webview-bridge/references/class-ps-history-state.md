# `PsHistoryState`

Stable read-only remote history state.

Async properties: `typename`, `id`, `docId`, `name`, `parent`, `snapshot`. Supports `batchGet`, empty `batchSet`, and `dispose`.

Assign a state to `document.activeHistoryState` or `activeHistoryBrushSource` to activate it. Those document setters are queued; use document `batchSet` when explicit completion is required.
