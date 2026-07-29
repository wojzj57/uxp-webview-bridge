# `Documents`

WebView-local snapshot collection from `await photoshop.app.documents`.

- Read-only array behavior, `typename: "Documents"`, and `parent` app.
- `getByName(name) -> PsDocument | null`
- `add(options?) -> PsDocument | null`

Creation options include name/preset, dimensions, resolution, mode, fill/color, depth, pixel scale, and profile. Re-read `photoshop.app.documents` after open/create/close; the existing collection does not refresh.
