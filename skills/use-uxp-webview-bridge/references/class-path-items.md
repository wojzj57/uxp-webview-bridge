# `PathItems`

Read-only array-like snapshot from `document.pathItems`, with `parent`.

- `add(name, entirePath: SubPathInfoInput[]) -> PsPathItem`
- `removeAll()`
- `getByName(name) -> PsPathItem | null`

Build input paths with exported `PathPointInfo` and `SubPathInfo` value classes. Re-read after mutation.
