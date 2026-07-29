# `TextItem`

Remote text object from a text layer's `textItem`.

Read-only: `parent`, `typename`, `isPointText`, `isParagraphText`, `characterStyle`, `paragraphStyle`, `warpStyle`. Writable queued: `contents`, `textClickPoint`, `orientation`.

Methods: `convertToParagraphText`, `convertToPointText`, `convertToShape`, `createWorkPath`, `batchGet`, `batchSet`, `dispose`.

Conversions mutate the layer and run modally. Point/paragraph conversions return a remote `TextItem`; reacquire dependent style objects after structural conversion if needed.
