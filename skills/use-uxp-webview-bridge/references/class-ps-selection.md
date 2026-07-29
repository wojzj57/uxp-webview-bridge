# `PsSelection`

Remote active pixel selection from `document.selection`.

Read-only async properties: `typename`, `docId`, `parent`, `bounds` (`null` when empty), `solid`.

Methods: `contract`, `deselect`, `expand`, `feather`, `grow`, `inverse`, `load`, `makeWorkPath`, `selectAll`, `selectRectangle`, `selectEllipse`, `selectPolygon`, `selectRow`, `selectColumn`, `save`, `saveTo`, `selectBorder`, `smooth`, `translateBoundary`, `resizeBoundary`, `rotateBoundary`, `batchGet`, `dispose`.

Shape calls take `{ left, right, top, bottom }` or `{ x, y }[]` and typed Photoshop selection/interpolation constants. `load` accepts a channel or layer. Mutations are host-modal.
