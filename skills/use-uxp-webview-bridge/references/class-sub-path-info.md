# `SubPathInfo`

WebView-local path-builder value class.

```ts
const subpath = new photoshop.SubPathInfo({
  closed: true,
  entireSubPath: [pointA, pointB, pointC],
  operation: photoshop.constants.ShapeOperation.SHAPEADD
});
const paths = await document.pathItems;
const pathItem = await paths.add("Triangle", [subpath]);
```

Fields: boolean `closed`, array `entireSubPath`, and typed `operation`. `typename` is `SubPathInfo`. No RPC or disposal.
