# `photoshop` root module

Import `photoshop` from `uxp-webview-bridge/webview`. Parent capability: `photoshop` (default enabled). Host/version/document support still varies.

Children: `app`, `action`, `core`, `imaging`; direct preference objects; synchronous `constants`; color/value constructors; `ColorConversionModel`.

```ts
const document = await photoshop.app.activeDocument;
const { name, width, height } = await document.batchGet(["name", "width", "height"]);
```

Most enum tables are synchronous (`photoshop.constants.BlendMode`, and matching direct constants where exported). Remote objects and properties are asynchronous. Public Imaging needs `imaging`; public batchPlay methods need `batchPlay` in addition to `photoshop`.
