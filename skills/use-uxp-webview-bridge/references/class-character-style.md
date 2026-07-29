# `CharacterStyle`

Remote writable text character style.

Properties: `font`, `size`, horizontal/vertical scale, faux bold/italic, auto leading/leading, tracking, baseline shift, diacritic positions, auto kerning, capitalization, baseline, strike-through, underline, ligatures/alternates/fractions/ordinals/swash/titling/stylistic alternates, language, character alignment, no-break, color, kashidas, Middle Eastern direction/digits, fractional widths, anti-alias method.

All reads are async; setter assignments queue. Methods: `reset`, `batchGet`, `batchSet`, `dispose`. Prefer `batchSet` when applying a style group.
