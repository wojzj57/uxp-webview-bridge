# UXP 模块实现审查报告

审查对象：

- `src/webview/uxp-api/modules/uxp`
- `src/uxp/uxp-api/modules/uxp`
- `src/types/uxp/index.d.ts`
- `uxp-document/uxp-api/reference-js/modules/uxp`

审查时间：2026-07-03

## 总结

当前 `uxp` 桥接模块不是 Adobe UXP `require("uxp")` 的完整远程实现，而是一个受限的 WebView 远程代理。实现与 `src/shared/contracts/uxp.ts` 中定义的桥接 contract 基本一致，整体边界清楚：WebView 侧只创建代理对象，真实 UXP 调用在 UXP host 侧执行，并且敏感能力通过 `BridgeCapabilities` gate。

主要问题不在已有 dispatch 逻辑是否能工作，而在“类型、文档、桥接 API 三者的语义没有对齐”。`src/types/uxp/index.d.ts` 更像原生 UXP ambient 类型声明，而不是当前 `uxp-webview-bridge/webview` 暴露的桥接 API 类型；如果把它当作实现完成度基准，会发现大量文档 API 尚未桥接。

`pnpm typecheck` 已通过。本次只审查，未改源码，未跑 `pnpm build`。

## 当前已实现范围

当前桥接方法清单集中在 `src/shared/contracts/uxp.ts` 的 `UXP_METHOD_NAMES`：

- `host.name`
- `host.version`
- `host.uiLocale`
- `versions.uxp`
- `versions.plugin`
- `shell.openPath`
- `shell.openExternal`
- `userInfo.userId`
- `pluginManager.plugins`
- `plugin.showPanel`
- `plugin.invokeCommand`
- `script.args`
- `script.executionContext`
- `script.setResult`
- `entrypoints.getPanel`
- `entrypoints.getCommand`
- `entrypoints.menuItems.*`
- `entrypoints.menuItem.*`
- `storage.secureStorage.*`

WebView 侧 `createUxpNamespace` 暴露：

- `host`
- `versions`
- `storage`
- `shell`
- `userInfo`
- `pluginManager`
- `script`
- `entrypoints`
- `xmp`

UXP 侧 `dispatchUxpCall` 对上述 method 做统一分发，并对 `shell/userInfo/secureStorage/pluginManager/script/entrypoints` 使用 capability gate。

## 相对文档的实现情况

文档入口 `uxp-document/uxp-api/reference-js/modules/uxp/index.md` 列出模块：

- Entry Points
- Host Information
- Key-Value Storage
- Persistent File Storage
- Plugin Manager
- User Information
- Versions
- XMP
- shell

实现状态如下：

| 文档模块 | 当前实现情况 | 备注 |
| --- | --- | --- |
| Host Information | 已桥接 | `name/version/uiLocale` 都通过 host property 读取 |
| Versions | 已桥接 | `uxp/plugin` 都通过 host property 读取 |
| shell | 部分桥接 | `openPath/openExternal` 已实现；`openExternal` 禁止 `file:` |
| User Information | 已桥接 | 仅 `userId()` |
| Plugin Manager | 已桥接 | `plugins`、`showPanel`、`invokeCommand` |
| script | 已桥接 | 文档位于 plugin-manager 目录；`args/executionContext/setResult` 已实现 |
| Entry Points | 部分桥接 | `setup` 明确禁止从 WebView 调用；`getPanel/getCommand/menuItems` 已桥接 |
| Key-Value Storage | 已桥接 secureStorage | `length/setItem/getItem/removeItem/key/clear` |
| Persistent File Storage | 未实质桥接 | 只提供 storage constants/errors/fileTypes；`localFileSystem` 是 unsupported façade |
| XMP | 未实质桥接 | 只提供顶层类名和部分静态工具函数，调用即抛 unsupported error |

## 相对 `src/types/uxp/index.d.ts` 的差异

`src/types/uxp/index.d.ts` 声明的 `uxp` 模块导出：

- `dialog`
- `entrypoints`
- `host`
- `os`
- `shell`
- `storage`
- `versions`

但当前 `src/webview/uxp-api/modules/uxp` 实际暴露：

- `host`
- `versions`
- `storage`
- `shell`
- `userInfo`
- `pluginManager`
- `script`
- `entrypoints`
- `xmp`

差异：

- 类型声明缺少当前实现已有的 `userInfo/pluginManager/script/xmp`。
- 类型声明包含 `dialog`，但当前两个 `uxp` 模块目录没有实现 `dialog`。
- 类型声明包含 `os`，但按本仓库目录规范 `os` 是独立模块：`src/webview/uxp-api/modules/os` 与 `src/uxp/uxp-api/modules/os`，不应混作 `uxp` 模块实现。
- `shell.openExternal` 在类型中返回 `void`，但桥接 contract 和 WebView 实现返回 `Promise<string>`。
- `storage.localFileSystem` 在类型中是完整 `LocalFileSystemProvider`，但 WebView 实现中所有方法都抛 unsupported error。

判断：`src/types/uxp/index.d.ts` 不应直接作为当前 WebView bridge public API 的完成度依据。它更接近原生 UXP `require("uxp")` 类型源。

## 主要风险和缺口

### 1. 类型和实现语义不一致

这是最高优先级问题。调用者如果参考 `src/types/uxp/index.d.ts` 或 Adobe 文档，会认为 `storage.localFileSystem`、`dialog`、完整 XMP、原生 Entry/File/Folder 都可用；但当前桥接层并未提供这些能力。

建议：

- 明确区分“原生 UXP 类型”和“WebView bridge 类型”。
- 若 `src/types/uxp` 继续保留为原生 UXP ambient 类型，应在文档或命名中说明它不是 `uxp-webview-bridge/webview` 类型。
- 若它要作为桥接类型，应改为从 `UxpNamespace` 派生或同步，并把 unsupported API 标成 `never`/明确抛错语义。

### 2. Persistent File Storage 只做了表面形状

文档中的 `localFileSystem` 包含文件选择、token、Entry/File/Folder 生命周期等能力。当前 WebView 侧 `localFileSystem` 只是 frozen object，所有实际方法 reject/throw，错误提示用户改用 `fs` namespace。

这在当前 bridge 设计下是合理限制，但必须被公开文档和类型准确表达，否则会形成错误承诺。

### 3. XMP 只做 unsupported façade

WebView 侧暴露 `XMPMeta/XMPFile/XMPDateTime/XMPIterator/XMPProperty/XMPFileInfo/XMPPacketInfo/XMPUtils/XMPConst` 的顶层形状，但没有 UXP host dispatch。所有实际调用都会抛出“not supported by uxp-webview-bridge”错误。

这也是合理限制，但不是文档意义上的 XMP 实现。

### 4. EntryPoints 远程引用没有释放策略

UXP host 侧 `entrypoints/references.ts` 使用模块级 `Map` 保存 `menuItems` 和 `menuItem` 引用。每次序列化 panel/menu item 都会分配新 id 并保留引用，没有 release 或 runtime destroy 清理。

长期运行、反复读取 panel/menu 的插件可能发生引用累积。建议至少在 `configUxpBridge().destroy()` 路径清理，或引入引用释放/TTL。

### 5. `shell.openExternal` 的 `file:` 检查大小写敏感

当前 UXP host 侧用 `url.startsWith("file:")` 禁止 file URL。URL scheme 语义上大小写不敏感，`FILE:/...` 不会被这个判断拦截。

建议解析 URL scheme，或至少使用 lower-case 后判断。

## 推荐处理顺序

1. 先决定 `src/types/uxp` 的角色：原生 UXP 类型源，还是 bridge WebView 类型源。
2. 修正 `shell.openExternal` 返回类型不一致和 `file:` scheme 检查。
3. 给 `localFileSystem` 与 `xmp` 写入明确的 public 文档或类型标记，避免误认为已实现。
4. 为 entrypoints remote reference registry 增加清理策略。
5. 如果未来要扩展能力，优先从 `localFileSystem` 的 token/URL 安全模型设计开始，不要直接透传原生 Entry/File/Folder 对象。

## 验证

已执行：

```powershell
pnpm typecheck
```

结果：通过。

