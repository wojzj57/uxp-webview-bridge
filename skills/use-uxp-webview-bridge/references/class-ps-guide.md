# `PsGuide`

Remote Photoshop guide.

Read-only: `typename`, `id`, `docId`, `parent`. Writable queued properties: `direction`, `coordinate`.

Methods: `delete`, `batchGet`, `batchSet`, `dispose`. Use Photoshop `Direction` constants for direction and `batchSet` when both direction and coordinate must update atomically from caller perspective.
