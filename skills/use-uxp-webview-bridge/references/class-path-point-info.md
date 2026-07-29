# `PathPointInfo`

WebView-local path-builder value class.

```ts
const point = new photoshop.PathPointInfo({
  anchor: [10, 10],
  leftDirection: [10, 10],
  rightDirection: [10, 10],
  kind: photoshop.constants.PointKind.CORNERPOINT
});
```

Each coordinate array must contain exactly two finite numbers. `kind` must be a supported `PointKind`. `typename` is `PathPointInfo`. Pass instances in a `SubPathInfo`; no RPC or disposal.
