# `ActionSet`

Remote Photoshop action set from `photoshop.app.actionTree`.

Read-only async properties: `typename`, `index`, `id`, `actions`. Writable queued: `name`. Methods: `delete`, `duplicate`, `play`, `batchGet`, `batchSet`.

Re-read `actionTree` after mutation. `actions` is a snapshot array of remote `Action` objects.
