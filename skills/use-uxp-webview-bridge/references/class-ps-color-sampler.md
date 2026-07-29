# `PsColorSampler`

Remote color sampler.

Read-only async properties: `typename`, `docId`, `parent`, `position`, `color`. Methods: `move(position)`, `remove`, `batchGet`, empty `batchSet`, `dispose`.

`position` is `{ x, y }`. `color` is `PsSolidColor` or `{ typename: "NoColor" }` when sampling yields no color.
