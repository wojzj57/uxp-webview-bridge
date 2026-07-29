# `Preferences`

Read-only root remote preferences object, available as `photoshop.app.preferences` and `photoshop.preferences`.

Async child references: `general`, `interface`, `tools`, `history`, `fileHandling`, `performance`, `cursors`, `transparencyAndGamut`, `unitsAndRulers`, `guidesGridsAndSlices`, `type`, `notifications`. It supports `batchGet`; root properties are not writable.

Each child is also exposed directly on `photoshop` as `preferencesGeneral`, `preferencesInterface`, and similarly named properties. Use the category documents for writable fields.
