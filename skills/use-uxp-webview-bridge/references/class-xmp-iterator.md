# `XMPIterator`

Obtain from `meta.iterator(options?, schemaNS?, propName?)`; direct construction is intentionally unavailable.

- `next(): Promise<XMPProperty | null>` advances and returns `null` at the end.
- `skipSiblings()` skips sibling properties.
- `skipSubtree()` skips descendants.
- `dispose()` releases the host iterator.

Use `try/finally` and dispose even when iteration exits early.
