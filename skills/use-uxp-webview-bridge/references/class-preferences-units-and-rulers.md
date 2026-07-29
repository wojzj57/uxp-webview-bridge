# `PreferencesUnitsAndRulers`

Writable remote fields: `rulerUnits`, `typeUnits`, `pointSize`.

Reads are async; writes queue. Use Photoshop constants rather than ad-hoc strings, and use `batchSet` for a coordinated unit change.
