# UXP WebView Bridge 规范上下文

这个仓库实现的是 UXP 主环境和 WebView 环境之间的 Bridge 库。它不实现业务前端功能。

## Language

**Bridge Library**:
连接 UXP 主环境和 WebView 环境的单包库。它只提供跨环境调用能力，不承载业务前端功能。
_Avoid_: App shell, frontend framework, business UI

**UXP Side**:
运行在 Adobe UXP 插件主环境中的库侧。它拥有真实的 UXP、Photoshop、OS、文件系统等宿主能力。
_Avoid_: Backend, server

**WebView Side**:
运行在 WebView 页面中的库侧。它只暴露远程代理命名空间，不能直接持有或导入 UXP Side 的实现。
_Avoid_: Browser side with native access, UXP client

**Shared Layer**:
WebView Side 和 UXP Side 共同依赖的协议、类型和错误语义层。它不包含任何具体 UXP API 或 Photoshop API 模块实现。
_Avoid_: Common module implementation, mixed runtime layer

**Remote Namespace**:
WebView Side 对外导出的命名空间代理，例如 `uxp`、`photoshop`、`os`。调用者从 WebView 入口直接导入这些命名空间。
_Avoid_: Client factory result, local native object

**Bridge Configuration**:
每个运行环境唯一的桥接初始化动作。WebView Side 使用 `configWebviewBridge`，UXP Side 使用 `configUxpBridge`。
_Avoid_: create client, create host, multiple setup APIs

**Bridge Module**:
一个可被桥接的 API 模块，例如 `os`、`photoshop.app` 或 `uxp.storage`。模块在 WebView Side 和 UXP Side 必须有对称目录，并且一个目录只承载一个模块的内容。
_Avoid_: Module bundle, merged adapter folder

**UXP API Module Path**:
UXP API 模块的对称源码路径。模块必须放在 `src/{webview,uxp}/uxp-api/modules/{moduleName}`，例如 `src/webview/uxp-api/modules/os` 和 `src/uxp/uxp-api/modules/os`。
_Avoid_: `src/uxp/modules/{moduleName}`, shared module folder

## 必须遵守的核心判断

- WebView 不能直接访问 UXP/Photoshop API；所有真实调用都在 UXP host 侧执行。
- WebView 侧不能导入 UXP Side 的任何实现，只能依赖 `src/shared` 和 WebView-local 模块。
- WebView 侧暴露的是 Remote Proxy，不是真实 Photoshop 对象。
- WebView 入口直接导出 `uxp`、`photoshop`、`os` 等远程命名空间。
- WebView 和 UXP 各自只有一个桥接配置方法：`configWebviewBridge` / `configUxpBridge`。
- WebView 和 UXP 的桥接模块目录必须对称，并且一个目录只承载一个模块。
- API 风格尽量贴近 Photoshop UXP 原生 DOM，而不是自定义 facade。
- RemoteClass 按原生 Photoshop Class 结构改造。
- `constants` 在 WebView 本地保留一份静态镜像，不通过 RPC 读取。
- 第一版一个 Host 只绑定一个 WebView client。

## 双入口

必须使用单包，并拆分运行环境子路径入口：

```ts
import { configWebviewBridge, os, photoshop, uxp } from "uxp-webview-bridge/webview";
import { configUxpBridge } from "uxp-webview-bridge/uxp";
```

WebView 入口不能依赖 `require("photoshop")`、`require("uxp")`、`require("fs")`，也不能从 `src/uxp` 导入任何内容。

UXP 入口负责真实调用：

- `require("photoshop")`
- `require("fs")`
- WebView `postMessage`
- origin 校验
- resource handle 管理

## 属性语义

属性赋值不能立即 RPC，因为 JS setter 不能 `await`。

必须实现以下规则：

```txt
属性赋值：进入全局 pending write queue
属性读取：先 flush 全局 queue，再远程 get
方法调用：先 flush 全局 queue，再远程 call
显式 flush：提交全局 queue
不做本地属性缓存
```

示例必须成立：

```js
layer.name = "Hero";
layer.visible = true;

await layer.rotate(-90); // 先提交 name/visible，再 rotate
const name = await layer.name; // 先 flush，再远程读取
```

## Modal 语义

保留原生命名：

```js
await photoshop.core.executeAsModal(async () => {
  layer.name = "Hero";
  await layer.rotate(-90);
}, { commandName: "Prepare layer" });
```

callback 在 WebView 执行。真实 Photoshop 操作在 UXP host 侧按队列执行。

规则：

- adapter 标记 mutating 操作。
- 显式 `executeAsModal` 内的 mutating 操作复用同一个 transaction。
- 显式 modal 外的 mutating 操作自动开启短 `executeAsModal`。
- 纯读取不进入 modal。
- `action.batchPlay` 默认视为 mutating。

## 错误语义

WebView 侧统一抛 `BridgeRemoteError`，不能假装是本地 UXP Error。

必须保留：

- `remoteName`
- `remoteMessage`
- `remoteStack`
- `code`
- `operationId`

## 对象身份和生命周期

- 不保证同一个远程对象返回同一个 WebView Proxy 实例。
- 业务身份通过远程 id 判断，例如 `documentID` / `layerID`。
- `Document` / `Layer` 是 persistent reference，不要求用户 dispose。
- `PhotoshopImageData`、文件句柄等是 resource handle，必须显式 `dispose()` / `close()`。
- Host 必须有超时兜底回收 resource handle。

## 第一版 Photoshop 范围

支持模块：

- `photoshop.app`
- `photoshop.core`
- `photoshop.action`
- `photoshop.imaging`
- `photoshop.constants`

支持 App：

- `activeDocument`
- `documents`

支持 Document：

- 常用读属性：`id`、`name`、`title`、`width`、`height`、`resolution`、`mode`、`saved`、`path`
- `activeLayers`
- `layers`
- `createLayer`
- `close`
- `closeWithoutSaving`

支持 Layers：

- `length`
- `at(index)`
- `toArray()`

不把 Layers 模拟成完整 Array。

支持 Layer：

- 常用读写属性：`id`、`name`、`visible`、`opacity`、`blendMode`、`kind`、`bounds`、`boundsNoEffects`、`document`、`layers`、`parent`
- 常用方法：`rotate`、`scale`、`translate`、`duplicate`、`delete`、`move`、`bringToFront`

## batchPlay

第一版支持并默认开启：

```js
await photoshop.action.batchPlay(commands, options);
```

规则：

- 默认 mutating。
- 显式 modal 内复用 transaction。
- 显式 modal 外自动短 modal。
- 可以预留关闭 modal 的 escape hatch，但默认必须包 modal。

## Imaging

`imaging.getPixels` 保留原生返回形状：

```js
const imageObj = await photoshop.imaging.getPixels(options);
const data = await imageObj.imageData.getData({ chunky: true });
await imageObj.imageData.dispose();
```

`imageObj.imageData` 是 `RemotePhotoshopImageData`。

第一版支持：

- `getPixels`
- `putPixels`
- `getLayerMask`
- `putLayerMask`
- `getSelection`
- `putSelection`
- `createImageDataFromBuffer`
- `encodeImageData`

`putPixels` / `putLayerMask` / `putSelection` 不自动 dispose。

## fs

第一版支持 `fs`，但只允许：

- `plugin:`
- `plugin-data:`
- `plugin-temp:`

不支持：

- `uxp.storage.localFileSystem`
- 文件选择器
- `File` / `Folder` / `Entry`
- 原生 `file:` 路径
- 无 scheme 路径

`fs.open` 必须返回 `RemoteFileHandle`，不能把真实 fd 数字暴露给 WebView。

## 二进制传输

不能依赖 `postMessage` transfer。

必须通过 bytes envelope：

- 小数据可使用 `number[]`
- 大数据使用 base64
- WebView API 尽量还原为 `ArrayBuffer` / `TypedArray`

分块策略属于内部配置，不能污染 Photoshop 原生 API 参数。

## 安全

Host 必须检查 message origin。

默认只允许本地 origin。远程 WebView 必须显式配置 `allowedOrigins`。

capabilities 要可配置，默认开启第一版能力：

```ts
{
  photoshop: true,
  imaging: true,
  batchPlay: true,
  fs: {
    read: true,
    write: true,
    schemes: ["plugin:", "plugin-data:", "plugin-temp:"]
  }
}
```

## 暂不支持

- `uxp.storage.localFileSystem`
- `saveAs`
- `app.open`
- 文件 picker
- `file:` 路径
- 完整 Array 语义
- 多 WebView client
- 完整 UXP API 镜像
