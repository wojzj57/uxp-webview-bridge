# uxp-webview-bridge

[English](./README.md)

`uxp-webview-bridge` 将经过选择的 Adobe UXP 与 Photoshop API 暴露给 WebView，同时确保所有真实的宿主操作仍在 UXP 插件运行时执行。WebView 导入异步远程命名空间；UXP 端负责校验消息来源与能力、分发调用并管理原生资源。

> [!IMPORTANT]
> 该包目前处于早期开发阶段。支持范围以下文记录的 API 为准，而不是 Adobe UXP 或 Photoshop 类型声明中的全部成员。

## 目录

- [为什么使用它？](#为什么使用它)
- [安装与构建](#安装与构建)
- [快速开始](#快速开始)
- [能力总览](#能力总览)
- [详细支持范围](#详细支持范围)
- [桥接语义](#桥接语义)
- [宿主权限与安全](#宿主权限与安全)
- [兼容性与限制](#兼容性与限制)
- [测试](#测试)

## 为什么使用它？

UXP WebView 无法直接调用 `require("uxp")`、`require("photoshop")`、`fs` 或 `os` 等仅限宿主使用的模块。本库提供：

- WebView 端可直接使用的 `fs`、`os`、`path`、`uxp` 和 `photoshop` 等命名空间；
- 由 UXP 宿主执行的转发 `fetch`，不受浏览器 CORS 限制；
- 传输安全的二进制载荷、远程回调、取消、超时和结构化远程错误；
- Photoshop 文档和图层的稳定远程对象标识；
- 由宿主负责的 Photoshop 修改操作模态执行；以及
- UXP 端的能力和来源校验。

运行时边界是有意设计的：WebView bundle 只能导入 `uxp-webview-bridge/webview`，UXP 宿主 bundle 只能导入 `uxp-webview-bridge/uxp`。

## 安装与构建

从公共 npm registry 安装该包：

```bash
pnpm add uxp-webview-bridge
```

如需参与开发，请克隆仓库并在本地构建：

```bash
pnpm install
pnpm build
```

在 pnpm workspace 中，将它作为 workspace 依赖添加到使用方包：

```json
{
  "dependencies": {
    "uxp-webview-bridge": "workspace:*"
  }
}
```

请将两个子路径入口分别打包到各自的运行时。不要在 WebView 中加载 UXP 入口，也不要在 UXP 中加载 WebView 入口。

## 快速开始

### 1. 配置 UXP 宿主

针对 `<webview>` 元素配置一次桥接。Business RPC 默认全部拒绝，因此以下示例只显式允许后文使用的六个叶子能力：

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";

const webview = document.querySelector("webview") as
  | Parameters<typeof configUxpBridge>[0]["webview"]
  | null;

if (!webview) {
  throw new Error("The plugin WebView element was not found.");
}

const bridge = configUxpBridge({
  webview,
  capabilities: ["fetch", "fs", "os", "path", "photoshop.dom", "uxp.host"]
});

window.addEventListener("unload", () => {
  void bridge.destroy();
});
```

如果 WebView 加载远程内容，请在两端配置完全匹配的可信来源：

```ts
const allowedOrigins = ["https://app.example.com"];

const bridge = configUxpBridge({
  webview,
  allowedOrigins,
  capabilities: ["fetch", "fs", "os", "path", "photoshop.dom", "uxp.host"]
});
```

Bridge 两端始终允许 UXP 本地的 `plugin:`、`plugin-data:`、`plugin-temp:` scheme，以及使用任意端口的 HTTP/HTTPS `localhost` 和 `127.0.0.1` 回环来源。`allowedOrigins` 只负责追加可信来源，不会替换这些默认值。追加值如果以 `:` 结尾，会匹配整个 scheme；其他追加值执行精确来源匹配。

### 2. 配置并使用 WebView

```ts
import {
  configWebviewBridge,
  fetch as hostFetch,
  fs,
  os,
  path,
  photoshop,
  uxp
} from "uxp-webview-bridge/webview";

const bridge = configWebviewBridge({
  timeoutMs: 15_000,
  allowedOrigins: ["https://app.example.com"]
});

const platform = await os.platform();
const dataPath = await path.join("plugin-data:", "settings.json");

await fs.writeFile(dataPath, JSON.stringify({ platform }), { encoding: "utf-8" });
const response = await hostFetch("https://api.example.com/status");
const hostName = await uxp.host.name;
const activeDocument = await photoshop.app.activeDocument;

console.log({ hostName, documentName: await activeDocument.name, status: response.status });

window.addEventListener("unload", () => {
  void bridge.destroy();
});
```

未显式传入 `target` 时，WebView 客户端通过 `window.uxpHost` 发送消息。重新配置同一端之前，应先调用并等待 `destroy()` 完成。

## 能力总览

每个已知 Business RPC 都只映射到一个叶子 Bridge capability。省略 `capabilities` 等价于传入 `[]`，所以下表各项默认均被拒绝。

- **契约**：已被本地静态检查、类型检查或 Node 契约测试覆盖。
- **CDP 用例**：存在真实 UXP/Photoshop 测试用例；如果宿主缺少 API 或所需权限，具体用例可能跳过。

| 叶子能力 | WebView API | 默认值 | 验证 | 说明 |
| --- | --- | --- | --- | --- |
| `clipboard` | `clipboard` | 拒绝 | 契约 + CDP 用例 | 文本和 UXP 剪贴板数据；可能还需要 manifest 权限。 |
| `crypto` | `crypto` | 拒绝 | 契约 + CDP 用例 | `getRandomValues` 和 `randomUUID` 在 UXP 中执行。 |
| `fetch` | `fetch`、`installFetch` | 拒绝 | 契约 | 请求在 UXP 中执行；仍受 manifest 网络权限限制。 |
| `fs` | `fs` | 拒绝 | 契约 + CDP 用例 | 文件描述符由宿主管理，空闲 60 秒后自动关闭。 |
| `localStorage` | `localStorage` | 拒绝 | 契约 + CDP 用例 | 异步 UXP 本地存储。 |
| `os` | `os` | 拒绝 | 契约 + CDP 用例 | 只读的平台、内存和 CPU 信息。 |
| `path` | `path` | 拒绝 | 契约 + CDP 用例 | 默认、`posix` 和 `win32` 三种风格。 |
| `sessionStorage` | `sessionStorage` | 拒绝 | 契约 + CDP 用例 | 异步 UXP 会话存储。 |
| `photoshop.dom` | Photoshop DOM，以及三个公开 batchPlay 方法之外的 Action 方法 | 拒绝 | 契约 + CDP 用例 | 包含远程对象和 DOM 内部实现调用。 |
| `photoshop.core` | `photoshop.core` | 拒绝 | 契约 + CDP 用例 | 与 DOM、Imaging 和 batchPlay 叶子相互独立。 |
| `photoshop.imaging` | `photoshop.imaging` | 拒绝 | 契约 + CDP 用例 | 包含 image-data 句柄方法。 |
| `photoshop.batchPlay` | `photoshop.action.batchPlay`、`.batchPlaySync`、`photoshop.app.batchPlay` | 拒绝 | 契约 + CDP 用例 | 只控制三个公开 batchPlay RPC。 |
| `uxp.host` | `uxp.host` | 拒绝 | 契约 + CDP 用例 | 宿主名称、版本和 UI locale。 |
| `uxp.versions` | `uxp.versions` | 拒绝 | 契约 + CDP 用例 | UXP 和插件版本。 |
| `uxp.shell` | `uxp.shell` | 拒绝 | 契约 + CDP 用例 | 仍受 manifest 启动权限限制。 |
| `uxp.userInfo` | `uxp.userInfo` | 拒绝 | 契约 + CDP 用例 | manifest 中需要 `enableUserInfo`。 |
| `uxp.pluginManager` | `uxp.pluginManager` | 拒绝 | 契约 + CDP 用例 | 插件快照、面板和命令。 |
| `uxp.storage.secureStorage` | `uxp.storage.secureStorage` | 拒绝 | 契约 + CDP 用例 | 支持字符串/二进制写入和二进制读取。 |
| `uxp.storage.localFileSystem` | `uxp.storage.localFileSystem` 和 Entry 远程对象 | 拒绝 | 契约 + CDP 用例 | 选择器、token、条目、文件和文件夹。 |
| `uxp.xmp` | `uxp.xmp` | 拒绝 | 契约 + CDP 用例 | XMP 远程对象、工具和常量。 |

能力数组还可以包含仅用于配置的分组 `photoshop.all`、`uxp.all` 和 `uxp.storage.all`。分组会展开为已安装库版本中已知的全部后代叶子。顶层 `capabilities: "all"` 会展开为全部已知叶子；`["all"]` 无效。`"all"` 和 `*.all` 都可能在升级后授权新增加的叶子，因此需要稳定最小权限的生产配置应逐一列出叶子名称。

运行时会复制并规范化输入、去重重叠 selector，并通过 `bridge.capabilities` 以 catalog 顺序公开冻结的叶子快照。未知 selector、`uxp.*` 这类通配符以及旧布尔对象都会在监听器或适配器设置前抛出 `TypeError`。如需更改策略，应销毁当前运行时后重新配置。

### 从布尔 capability override 迁移

迁移前：

```ts
configUxpBridge({
  webview,
  capabilities: { fs: true, shell: true, photoshop: true }
});
```

迁移后：

```ts
configUxpBridge({
  webview,
  capabilities: ["fs", "uxp.shell", "photoshop.dom"]
});
```

只应把 `capabilities: "all"` 用作有意为之的宽松迁移或开发逃生口。Capability 只限制桥接分发；它不会添加 Adobe UXP manifest 权限、接受某个 WebView 来源，也不会让宿主中不存在的 API 变为可用。

## 详细支持范围

### UXP 与运行时中立命名空间

| 命名空间 | 支持的成员 |
| --- | --- |
| `clipboard` | `write`、`writeText`、`read`、`readText` |
| `crypto` | `getRandomValues`、`randomUUID` |
| `fetch` | 类原生的 `fetch(input, init)`，返回 WebView `Response`；支持请求头、文本/二进制/form body、重定向和 `AbortSignal`；`installFetch()` 可选择替换全局实现，并返回卸载函数 |
| `fs` | `readFile`、`writeFile`、`open`、`close`、`read`、`write`、`lstat`、`rename`、`copyFile`、`unlink`、`mkdir`、`rmdir`、`readdir`；字符串和二进制传输；`Stats` 判断方法 |
| `os` | `platform`、`release`、`arch`、`cpus`、`totalmem`、`freemem`、`homedir` |
| `path` | `sep`、`delimiter`、`normalize`、`join`、`resolve`、`isAbsolute`、`relative`、`dirname`、`basename`、`extname`、`parse`、`format`；以及 `path.posix` 和 `path.win32` |
| `localStorage`、`sessionStorage` | 异步的 `length`、`key`、`getItem`、`setItem`、`removeItem`、`clear` |
| `uxp.host` | 异步的 `name`、`version`、`uiLocale` |
| `uxp.versions` | 异步的 `uxp`、`plugin` |
| `uxp.shell` | `openPath`、`openExternal`；`openExternal` 会拒绝 `file:` URL，文件请使用 `openPath` |
| `uxp.userInfo` | `userId` |
| `uxp.pluginManager` | 异步的 `plugins`；插件的 `id`、`version`、`name`、`manifest`、`enabled`、`showPanel`、`invokeCommand` |
| `uxp.storage.secureStorage` | 异步的 `length`、`setItem`、`getItem`、`removeItem`、`key`、`clear` |
| `uxp.storage.localFileSystem` | 打开/保存/文件夹选择器；临时/数据/插件文件夹；URL 条目创建和查询；FS/原生路径；会话和持久 token |
| UXP 存储条目 | 条目元数据、`copyTo`、`moveTo`、`delete` 和 `dispose`；文件 `read`/`write`；文件夹列举、创建、查询和重命名；类型判断和原生常量表 |
| `uxp.xmp` | `XMPMeta`、`XMPFile`、`XMPDateTime`、`XMPIterator`、`XMPUtils` 和 `XMPConst`，包括元数据属性/数组/结构/限定符操作、序列化、文件 packet 操作、命名空间工具和显式释放 |

### Photoshop 命名空间与远程对象

| 接口区域 | 支持的成员或对象族 |
| --- | --- |
| `photoshop` | `app`、`action`、`core`、`imaging`、同步 Photoshop 常量表、颜色构造器、`SolidColor`、`PathPointInfo` 和 `SubPathInfo` |
| `photoshop.app` | 活动文档、文档集合、对话框、前景色/背景色、当前工具、动作树、字体和首选项；颜色配置文件、单位转换、提醒、`batchPlay`、窗口置前、打开/创建文档、UI 更新、`batchGet` 和排队执行的 `batchSet` |
| `photoshop.action` | `batchPlay`、`batchPlaySync`、`getIDFromString`、`recordAction`、`validateReference`，以及通知监听器的注册/移除 |
| `photoshop.core` | `apiVersion`、通知监听、对话框尺寸、颜色转换、全局/局部坐标转换、临时文档所有权、模态执行、工具/CPU/GPU/显示器/图层树/菜单/插件/空闲时间查询、菜单执行、重绘、执行模式、提醒、尺寸调节控件和 UI 字符串翻译 |
| `photoshop.imaging` | `getPixels`、`putPixels`、`getLayerMask`、`putLayerMask`、`getSelection`、`putSelection`、`createImageDataFromBuffer` 和 `encodeImageData`；`PsImageData.getData()` 以及必须调用的 `dispose()` |
| 文档 | 标量和可写文档属性；图层、通道、参考线、路径、选区、历史、颜色取样器、计数项、图层复合和另存为辅助对象；复制/关闭/保存、拼合/合并、裁切/缩放/旋转/修剪、图层工厂和分组、颜色模式/配置文件转换、计算、生成式放大和基于回调的 `suspendHistory` |
| 图层 | 可读/可写图层状态、边界和相关对象；复制/链接/移动/变换/堆叠/编辑/栅格化；已声明的滤镜方法和 `applyImage`；`batchGet` 以及排队执行的 `batchSet` |
| 选区与通道 | 选区几何、载入、保存和边界操作；通道读写状态、复制/合并/移除和通道集合 |
| 历史、参考线与路径 | 历史快照；参考线创建/更新/移除；路径项、子路径、路径点、填充/描边/选区/剪贴操作和路径集合 |
| 文本 | `TextItem`、字符样式、段落样式、变形样式、转换/重置方法、可读/可写文本属性和字体集合 |
| 其他 DOM 对象族 | 颜色取样器、计数项/分组、图层复合、工具、动作集/动作、值对象和集合包装器 |
| 首选项 | 根首选项以及光标、文件处理、常规、参考线/网格/切片、历史、界面、通知、性能、工具、透明度/色域、文字、单位/标尺分组；通过异步属性和批量操作访问 |

从 `uxp-webview-bridge/webview` 导出的 TypeScript 声明是方法签名和属性类型的精确依据。某个原生 Adobe 类型出现在镜像声明文件中，并不代表桥接已实现该成员。

## 桥接语义

### 异步读取与有序写入

远程属性是异步的：

```ts
const document = await photoshop.app.activeDocument;
const name = await document.name;
```

JavaScript setter 无法异步执行。远程属性写入会进入队列，桥接会在后续读取或方法调用前刷新排队的写入：

```ts
const layer = (await document.activeLayers)[0];

if (layer) {
  layer.name = "Processed";       // 进入队列
  layer.opacity = 75;             // 排在 name 之后
  console.log(await layer.name);  // 先刷新两次写入
}
```

每个 WebView 远程类都提供带精确类型的 `batchGet(...)` 和 `batchSet(...)`。一次批处理只发送一个桥接请求，遵循排队写入顺序，并可等待 Host 完成：

```ts
const { name, opacity } = await layer.batchGet(["name", "opacity"]);
await layer.batchSet({ name: "Processed", opacity: 75 });
```

无效键或只读键会在本地以 `TypeError` 拒绝；Host 失败会以 `BridgeRemoteError` 拒绝。没有属性的类执行空批次时会在本地完成，不发送 RPC。

### 远程对象标识与集合

文档和图层使用稳定的远程引用。在条件允许时，再次解析同一个原生对象会返回同一个 WebView 远程对象。持久 DOM 引用不需要由用户例行释放。

集合包装器是 WebView 本地的时间点快照，不会自动刷新。需要观察宿主端新增或删除时，请重新读取对应集合属性。

临时资源句柄必须清理。特别是需要调用 `PsImageData.dispose()`，并关闭 `fs` 文件描述符。宿主也会执行超时清理，并在 bridge runtime 销毁时释放资源。

### 模态执行

UXP 宿主负责 Photoshop 模态策略。已声明的 DOM 和 imaging 修改调用会包装在 `executeAsModal` 中；读取操作不会无谓进入模态执行。`photoshop.core.executeAsModal` 和 `PsDocument.suspendHistory` 通过同一个宿主模态会话桥接回调及其嵌套调用。

### 错误、取消与二进制值

宿主失败会在 WebView 中以名为 `BridgeRemoteError` 的错误拒绝 Promise。错误保留远端 `name`、`message`、`stack`、可选的 `code` 和桥接 `operationId`；回调错误还可能包含父操作和回调元数据。

能力拒绝错误的 `code === "ERR_BRIDGE_CAPABILITY_DISABLED"`、`remoteName === "BridgeCapabilityError"`，并包含精确的 `operationId`、叶子 `capability`、协议 `module` 和已验证 `method`。这些字段是稳定的程序化契约；消息仅用于诊断，并且绝不包含请求参数。

可取消操作使用 bridge cancel envelope。转发 `fetch` 会将 `AbortSignal` 取消映射到该消息。二进制值通过传输安全的内联/base64 envelope 复制，而不依赖可转移的 `postMessage` 对象。

## 宿主权限与安全

Bridge capability、source/origin 验证和 Adobe UXP manifest 权限是三套独立控制。Capability 只授权桥接分发，不会信任某个来源或授予原生权限。请只添加插件实际使用的权限。根据所选 API，manifest 可能需要：

- WebView 和消息桥接权限；
- 转发 `fetch` 所需的 `network` domain；
- `fs` 或持久文件 API 所需的 `localFileSystem`；
- `clipboard` 权限；
- `uxp.shell` 所需的 `launchProcess` scheme/extension；以及
- `uxp.userInfo` 所需的 `enableUserInfo`。

UXP 宿主在分发前会同时校验消息来源对象及其 origin。对于远程内容，应严格限制 `allowedOrigins`。`http:`、`https:` 这类值会允许对应 scheme 下的所有来源，只应在明确需要如此宽泛的信任范围时使用。缺少 capability 时，对应调用会在适配器分发或原生模块加载之前被拒绝。

## 兼容性与限制

- 仓库中的真实宿主 fixture 将 Photoshop `24.4.0` 声明为最低版本。这是测试 fixture 的下限，并非针对所有桥接成员的公开兼容性承诺。
- Photoshop Core 方法会检查原生函数是否存在；当前宿主版本过旧时会返回带错误码的远程错误。已实现的 Core 接口包含原生 Photoshop 22.5 至 26.0 期间引入的 API。
- 其他 UXP 和 Photoshop 调用仍受已安装应用的 API 版本、文档模式/状态、平台和 manifest 权限影响。
- 本桥接不承诺覆盖全部 Adobe UXP 或 Photoshop API。仅支持本 README 与已导出 WebView 类型中明确提供的公开接口。
- 转发 `fetch` 会缓冲请求和响应 body，不支持 `ReadableStream` 请求 body，也不提供流式响应。
- 二进制数据需要序列化和复制，因此超大文件或像素缓冲区的开销高于同一运行时内的原生调用。
- 四个 Photoshop 叶子相互独立：启用 DOM、Core、Imaging 或公开 batchPlay 中的任一项，都不会启用另外三项。
- 该包的公开边界是 ESM。UXP 宿主通常需要针对目标运行时执行适当的 bundle 步骤。

## 测试

运行不需要 Photoshop 的完整本地门禁：

```bash
pnpm test
```

各项检查分别为：

```bash
pnpm test:static
pnpm typecheck
pnpm test:contract
pnpm build
```

只有在 fixture 插件和兼容宿主可用时，才运行真实 UXP/Photoshop CDP 覆盖：

```bash
pnpm test:uxp
pnpm test:uxp -- --case os.platform
```

CDP 用例会按需创建并清理自己的测试状态；依赖宿主的用例可能报告 `skipped`。测试约定和 runner 详情请参阅 [test/TESTING.md](./test/TESTING.md) 与 [test/README.md](./test/README.md)。项目术语和架构背景请参阅 [CONTEXT.md](./CONTEXT.md)。

## 许可证

[MIT](./LICENSE)
