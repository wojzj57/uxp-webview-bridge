# `TextFont`

Read-only remote font.

Async properties: `family`, `name`, `parent`, `postScriptName`, `style`, `typename`. Supports `batchGet` and empty `batchSet`.

Obtain fonts from `photoshop.app.fonts` or `TextFonts.getByName`. Use a font's appropriate string property when assigning `CharacterStyle.font`, according to the target Photoshop behavior.
