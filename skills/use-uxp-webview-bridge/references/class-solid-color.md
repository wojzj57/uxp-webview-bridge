# `SolidColor`

WebView-local value object; construction and model conversion do not cross RPC.

```ts
const color = new photoshop.SolidColor({ rgb: { hexValue: "FF8800" } });
photoshop.app.foregroundColor = color;
```

Model views: `rgb`, `hsb`, `cmyk`, `lab`, `gray`. Accessing a view switches/converts the active model. `nearestWebColor` returns an RGB view; `isEqual(other)` compares colors. `typename` is `SolidColor`.

Bridge color inputs may also be partial single-model objects such as `{ rgb: { red: 255 } }`. No disposal is needed.
