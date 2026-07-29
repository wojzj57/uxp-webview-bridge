# `path` module

Import `path` from `uxp-webview-bridge/webview`. It is always registered. The default flavor and `path.posix` / `path.win32` expose asynchronous Node-like operations.

Properties: `sep`, `delimiter` are promises. Methods: `normalize`, `join`, `resolve`, `isAbsolute`, `relative`, `dirname`, `basename`, `extname`, `parse`, `format`.

Most path inputs accept a string or an Entry-like object containing `nativePath` or `url`.

```ts
const configUrl = await path.join("plugin-data:", "config", "app.json");
const extension = await path.extname(configUrl);
const windows = await path.win32.normalize("C:\\temp\\..\\data");
```
