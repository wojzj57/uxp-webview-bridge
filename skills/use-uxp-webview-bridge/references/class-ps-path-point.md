# `PsPathPoint`

Read-only remote path point.

Async properties: `typename`, `parent`, `anchor`, `kind`, `leftDirection`, `rightDirection`. Supports `batchGet`, empty `batchSet`, and `dispose`.

Coordinates are numeric arrays. Use local `PathPointInfo` instances to define new points; this remote class represents points already owned by Photoshop.
