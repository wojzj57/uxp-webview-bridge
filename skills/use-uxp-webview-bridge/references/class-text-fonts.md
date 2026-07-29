# `TextFonts`

Read-only array-like snapshot from `await photoshop.app.fonts`, with `parent`, `typename`, and `getByName(name) -> TextFont | null`.

Re-read the property if the host's available-font list may have changed.
