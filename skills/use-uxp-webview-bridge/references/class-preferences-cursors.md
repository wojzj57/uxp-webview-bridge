# `PreferencesCursors`

Writable remote preference category.

- `paintingCursors`
- `otherCursors`

Both use Photoshop constant values. Reads are async, assignments queue, and `batchGet` / `batchSet` provide explicit grouped operations.
