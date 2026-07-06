# UXP WebView Bridge 设计方案

## 目标

这个库只负责 Adobe UXP 插件主环境和 WebView 运行环境之间的桥接，不实现真实前端业务功能。

核心目标是让 WebView 侧可以用接近 Photoshop UXP 原生 API 的方式调用 UXP/Photoshop 能力：

```js
const doc = await photoshop.app.activeDocument;
const layer = await (await doc.activeLayers).at(0);

layer.name = "Hero";
await layer.rotate(-90);
```

WebView 侧拿到的对象不是 Photoshop 原生对象，而是远程代理对象。真实 API 调用始终在 UXP 主环境执行。

## 非目标

- 不让 WebView 直接访问 `require("photoshop")`、`require("uxp")` 或 `require("fs")`。
- 不做完整 UXP API 镜像。
- 第一版不支持 `uxp.storage.localFileSystem`、文件选择器、`File` / `Folder` / `Entry` 对象代理。
- 第一版不支持任意本地 `file:` 路径访问。
- 第一版不模拟集合为完整 JavaScript Array。
- 第一版不保证同一个远程对象返回同一个 WebView Proxy 实例。

## 包结构

库是单包，拆成两个运行环境子路径入口：

```ts
// WebView side
import { configWebviewBridge, fs, os, photoshop, uxp } from "uxp-webview-bridge/webview";

configWebviewBridge();
```

```ts
// UXP plugin side
import { configUxpBridge } from "uxp-webview-bridge/uxp";

configUxpBridge({
  webview: document.querySelector("webview")
});
```

第一版一个 UXP host 只绑定一个 WebView client。资源句柄、modal transaction、请求队列都归属于这个 client session。

## 通信模型

WebView 和 UXP 通过 WebView `postMessage` 通信：

- WebView 调用 `window.uxpHost.postMessage(...)` 发请求。
- UXP host 通过 `webview.postMessage(...)` 回响应。
- Host 接收 message 时必须校验 origin。

请求/响应都带 `operationId`，用于匹配结果、错误和调试日志。

协议需要支持：

- `get`: 读取远程属性。
- `set`: 写入远程属性。
- `call`: 调用远程方法。
- `flush`: 提交 pending 属性写入。
- `dispose` / `close`: 释放资源句柄。
- `hello` / `ready`: 初始化握手。

## 初始化握手

WebView client 初始化后先发送：

```txt
bridge.hello { protocolVersion, clientVersion }
```

UXP host 返回：

```txt
bridge.ready { protocolVersion, hostVersion, capabilities, constantsHash }
```

主协议版本不兼容时初始化失败。`constantsHash` 不一致第一版先警告，不阻断。

## 安全策略

默认只允许本地 WebView origin。远程 WebView 必须显式配置 allowlist：

```ts
configUxpBridge({
  webview,
  allowedOrigins: ["plugin:", "plugin-data:"]
});
```

远程页面示例：

```ts
configUxpBridge({
  webview,
  allowedOrigins: ["https://app.example.com"]
});
```

Host 收到 message 时必须检查 `e.origin`。不在 allowlist 内的请求直接拒绝。

Host 支持 capabilities 配置，默认开启第一版能力：

```ts
configUxpBridge({
  webview,
  capabilities: {
    photoshop: true,
    imaging: true,
    batchPlay: true,
    fs: {
      read: true,
      write: true,
      schemes: ["plugin:", "plugin-data:", "plugin-temp:"]
    }
  }
});
```

## API 风格

对外 API 尽量贴近 Photoshop UXP 原生结构：

```js
const { app, core, action, imaging, constants } = photoshop;

const doc = await app.activeDocument;
const layers = await doc.activeLayers;
const layer = await layers.at(0);

await core.executeAsModal(async () => {
  layer.name = "Hero";
  await layer.rotate(-90);
}, { commandName: "Prepare layer" });
```

内部类可以命名为 `RemoteLayer`、`RemoteDocument`，但导出类型尽量使用原生命名：

```ts
export type Layer = RemoteLayer;
export type Document = RemoteDocument;
```

## RemoteClass 模型

WebView 侧的 class 按原生 Photoshop Class 结构建立：

- `RemotePhotoshop`
- `RemoteApp`
- `RemoteDocument`
- `RemoteLayers`
- `RemoteLayer`
- `RemoteSelection`
- `RemotePhotoshopImageData`
- `RemoteFileHandle`

`Document` / `Layer` 这类对象是 persistent reference，靠 `documentID` / `layerID` 重新定位，不要求用户释放。

`PhotoshopImageData`、文件 fd 等是 resource handle，必须显式 `dispose()` / `close()`，Host 侧另做超时兜底回收。

## 属性读写语义

JavaScript 属性赋值不能 `await`，因此属性写入不立即发 RPC。

规则：

```txt
属性赋值：进入全局 pending write queue
属性读取：先 flush 全局 queue，再远程 get
方法调用：先 flush 全局 queue，再远程 call
显式 flush：提交全局 queue
不做本地属性缓存
```

示例：

```js
const layer = await (await doc.activeLayers).at(0);

layer.name = "Hero";
layer.visible = true;

await layer.rotate(-90); // 先提交 name/visible，再 rotate

const name = await layer.name; // 先 flush，再远程读取真实值
```

因为不做本地缓存，每次属性读取都走远程 RPC。

## Modal 事务

保留原生命名 `photoshop.core.executeAsModal`。

WebView callback 仍在 WebView 环境执行，真实 Photoshop 操作在 UXP host 侧排队执行：

```js
await photoshop.core.executeAsModal(async () => {
  const doc = await photoshop.app.activeDocument;
  const layer = await (await doc.activeLayers).at(0);

  layer.name = "Hero";
  await layer.rotate(-90);
}, {
  commandName: "Prepare layer"
});
```

规则：

- mutating 操作由 adapter 标记。
- 显式 `executeAsModal` 内的 mutating 操作复用当前 transaction。
- 显式 modal 外的 mutating 操作自动开启一次短 `executeAsModal`。
- 纯读取不进入 modal。
- `action.batchPlay` 默认视为 mutating。

## 错误模型

UXP 侧错误在 WebView 侧统一抛 `BridgeRemoteError`。

字段：

```ts
class BridgeRemoteError extends Error {
  remoteName?: string;
  remoteMessage: string;
  remoteStack?: string;
  code?: string;
  operationId: string;
}
```

用户仍然使用普通 `try/catch`：

```js
try {
  await layer.rotate(-90);
} catch (error) {
  console.log(error.name, error.remoteMessage, error.operationId);
}
```

## 二进制传输

WebView `postMessage` 不依赖 transfer。协议层定义 bytes envelope。

规则：

- 小数据可以使用 `number[]`。
- 大数据使用 base64 string。
- WebView API 尽量还原为 `ArrayBuffer` / `TypedArray`。
- 分块策略是库内部配置，不污染 Photoshop 原生 API 参数。

内部 envelope 示例：

```ts
{
  type: "bytes",
  encoding: "base64",
  data: "..."
}
```

## Photoshop API 第一版范围

### Photoshop modules

- `photoshop.app`
- `photoshop.core`
- `photoshop.action`
- `photoshop.imaging`
- `photoshop.constants`

`constants` 在 WebView 本地保留一份静态镜像，不走 RPC。

### App

- `activeDocument`
- `documents`
- 第一版不做 `open`，除非后续能避开 `File Entry` 依赖。

### Document

支持常用读属性：

- `id`
- `name`
- `title`
- `width`
- `height`
- `resolution`
- `mode`
- `saved`
- `path`

支持集合/方法：

- `activeLayers`
- `layers`
- `createLayer`
- `close`
- `closeWithoutSaving`

第一版不做 `saveAs`，因为它依赖 UXP `File Entry`。

### Layers

不模拟 Array。只支持明确方法/属性：

- `length`
- `at(index)`
- `toArray()`

### Layer

支持常用读写属性：

- `id`
- `name`
- `visible`
- `opacity`
- `blendMode`
- `kind`
- `bounds`
- `boundsNoEffects`
- `document`
- `layers`
- `parent`

支持常用方法：

- `rotate`
- `scale`
- `translate`
- `duplicate`
- `delete`
- `move`
- `bringToFront`

## batchPlay

第一版支持并默认开启：

```js
await photoshop.action.batchPlay(commands, options);
```

规则：

- 默认视为 mutating。
- 显式 `executeAsModal` 内复用当前 transaction。
- 显式 modal 外自动开启短 `executeAsModal`。
- 可以预留 `bridge.modal = false` escape hatch，但主路径默认 modal。

## Imaging API

保留原生返回形状：

```js
const imageObj = await photoshop.imaging.getPixels(options);

const data = await imageObj.imageData.getData({ chunky: true });
await imageObj.imageData.dispose();
```

其中：

- `imageObj.imageData` 是 `RemotePhotoshopImageData`。
- `sourceBounds` / `level` 是普通 JSON 值。
- `getData(options)` 参数保持原生，不加入 `bridge.chunkSize`。

第一版支持：

- `getPixels`
- `putPixels`
- `getLayerMask`
- `putLayerMask`
- `getSelection`
- `putSelection`
- `createImageDataFromBuffer`
- `encodeImageData`

`createImageDataFromBuffer` 支持 WebView `ArrayBuffer` / `TypedArray` 通过 bytes envelope 传到 UXP 侧，再返回 `RemotePhotoshopImageData`。

`putPixels` / `putLayerMask` / `putSelection` 不自动 dispose `imageData`。生命周期保持原生语义，由用户显式 `dispose()`。

## fs API

第一版支持 `require("fs")` 风格的最小能力，但只允许 plugin schemes：

- `plugin:`
- `plugin-data:`
- `plugin-temp:`

不支持无 scheme 路径，不支持 `file:`。

一次性 API 直接返回结果：

```js
const text = await fs.readFile("plugin-data:/x.txt", { encoding: "utf-8" });
await fs.writeFile("plugin-data:/x.txt", "hello", { encoding: "utf-8" });
```

`fs.open` 返回 `RemoteFileHandle`，不暴露真实 fd 数字：

```js
const file = await fs.open("plugin-data:/fileToRead.txt", "r");

try {
  const buffer = new ArrayBuffer(1024);
  const { bytesRead } = await file.read(buffer, 0, 1024, 0);
} finally {
  await file.close();
}
```

UXP host 维护 `token -> real fd` 映射，并在 `close()` 或超时后释放。

## TypeScript 类型

第一版就提供 TypeScript 类型。RemoteClass 按原生 Class 改造。

属性读取是异步，属性写入是同步入队，因此类型使用 accessor：

```ts
class RemoteLayer {
  get name(): Promise<string>;
  set name(value: string);

  get visible(): Promise<boolean>;
  set visible(value: boolean);

  rotate(angle: number, anchor?: constants.AnchorPosition): Promise<void>;
  flush(): Promise<void>;
}
```

这允许用户写：

```ts
layer.name = "Hero";
const name = await layer.name;
```

## 后续待决

- 是否从 `uxp-document` 自动生成部分 Proxy/Adapter stub。
- `constantsHash` 不一致是否从 warning 改为 hard failure。
- `bridge.modal = false` 是否公开为正式 API。
- resource handle 超时时间默认值。
- 日志和调试面板格式。
