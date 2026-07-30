[English](../security-and-permissions.md)

# 安全与权限

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

安全性由三种彼此独立的控制共同决定。启用其中一种并不能满足另外两种。

## 三种独立控制

1. **UXP 清单权限**决定原生宿主是否允许某类操作，例如网络或文件系统访问。
2. **消息 source/origin 验证**决定宿主是否接受来自已配置 WebView 上下文和来源的桥接消息。
3. **桥接能力**决定是否分发某个已知 Business RPC。

能力不会授予清单权限；清单权限不会授权任意 WebView 来源；接受某个来源也不会启用 Bridge capability。

## Source 与 origin 验证

宿主有条件地检查 `event.source`。当 source 存在/为真值且不同于已配置 WebView 时，消息会被拒绝。当 `event.source` 缺失或为 null 时，消息继续接受来源验证；因此，source identity 不是无条件的第二道门禁。

两种情况下 origin 都必须被接受。内置接受范围包括 `plugin:`、`plugin-data:` 和 `plugin-temp:`，以及使用任意有效端口的 HTTP/HTTPS `localhost` 或 `127.0.0.1` 回环来源。匹配规则如下：

- 以 `:` 结尾的允许值按前缀匹配；
- 其他允许值必须与规范化后的事件 origin 精确匹配。

应优先使用最小且显式的 `allowedOrigins` 列表。尤其要注意，添加 `http:` 或 `https:` 会信任整个 scheme，而不只是某个站点。对于远程内容，在事件 origin 形式允许时使用精确 origin、缩小 WebView 域允许列表，并且绝不能把条件 source 验证当成沙箱。

## 实际桥接能力

省略 `capabilities` 等价于传入 `[]`，并拒绝全部 Business RPC。Allowlist 只包含以下 20 个叶子：

| 功能族 | 叶子 Bridge capability |
| --- | --- |
| 顶层命名空间 | `clipboard`、`crypto`、`fetch`、`fs`、`localStorage`、`os`、`path`、`sessionStorage` |
| Photoshop | `photoshop.dom`、`photoshop.core`、`photoshop.imaging`、`photoshop.batchPlay` |
| UXP | `uxp.host`、`uxp.versions`、`uxp.shell`、`uxp.userInfo`、`uxp.pluginManager`、`uxp.storage.secureStorage`、`uxp.storage.localFileSystem`、`uxp.xmp` |

仅用于配置的分组为 `photoshop.all`、`uxp.all` 和 `uxp.storage.all`。顶层 `capabilities: "all"` 会启用全部已知叶子；`"all"` 不能作为数组成员。分组会展开为已安装包版本中所有匹配叶子，因此 `"all"` 和 `*.all` 都可能在升级新增后代叶子时扩大权限。生产策略需要在升级后保持稳定时，应逐一列出叶子。

Selector 可以重叠，结果会自动去重。未知名称、错误大小写、`uxp.*` 这类通配符、裸功能族名称、`["all"]` 以及旧布尔对象都会在设置监听器或适配器前抛出 `TypeError`。运行时通过 `runtime.capabilities` 公开按 catalog 排序并冻结的叶子快照；策略不可变，更改策略必须销毁并重新创建运行时。

四个 Photoshop 叶子相互独立，`photoshop.dom`、`photoshop.core`、`photoshop.imaging` 和 `photoshop.batchPlay` 不会互相隐含。同步 Photoshop 常量和 WebView 本地构造器不会跨桥，因此不需要 capability。

### 从布尔 override 迁移

迁移前：

```ts
configUxpBridge({
  webview,
  capabilities: {
    fs: true,
    shell: true,
    photoshop: true
  }
});
```

迁移后：

```ts
configUxpBridge({
  webview,
  capabilities: ["fs", "uxp.shell", "photoshop.dom"]
});
```

只有在明确接受当前及未来范围时才使用 `capabilities: "all"`。这里没有 capability 排除语法、`permissions` 选项或旧布尔兼容模式。

## UXP 清单权限映射

仓库中的 `test/uxp-plugin/manifest.json` 只证明 fixture 语法和测试需求。它刻意启用了广泛配置，包括所有网络域、完整文件系统访问、多个启动 scheme/扩展名、读写剪贴板、用户信息、宽松 WebView 设置、IPC 和字符串代码生成。这些值是**仅供测试的证据**，不是生产环境的最小权限。

| 功能 | 相关 fixture 权限键 |
| --- | --- |
| WebView 和消息桥 | `requiredPermissions.webview`（按需使用 `allow`、本地渲染、消息桥和 domains） |
| 转发 fetch | `requiredPermissions.network` |
| 直接文件系统/持久文件访问 | `requiredPermissions.localFileSystem` |
| Shell 路径/URL 启动 | `requiredPermissions.launchProcess` |
| 剪贴板 | `requiredPermissions.clipboard` |
| 用户身份 | `requiredPermissions.enableUserInfo` |

请根据目标宿主和版本的 Adobe 清单契约选择确切生产值。此仓库不能证明通用最小值。除非应用确实需要并完成评审，否则不要复制 fixture 专用的 `ipc`、`allowCodeGenerationFromStrings`、`"all"` 域、所有扩展名或完整文件系统访问。

## 数据与密钥处理

- 不要在 URL、日志、示例、`localStorage` 或 `sessionStorage` 中放置凭据。
- 使用 `uxp.storage.secureStorage` 保存秘密字节，并删除不再需要的值。
- 转发 fetch 由 UXP 宿主发起请求，因此绕过 WebView CORS 执行。它不会超出清单网络权限，也不能成为不受信任来源的通用请求原语。
- 将 Photoshop action descriptor 和路径视为调用者控制的输入。给 WebView 开放修改性或广泛原生操作前，应先验证应用层意图。
- 释放临时 storage、XMP 和 imaging 资源句柄，避免宿主资源一直保留到超时清理。

## 诊断拒绝

| 失败阶段 | 常见证据 | 解决方式 |
| --- | --- | --- |
| WebView 策略 | 页面或桥不可用 | 修正目标宿主/版本清单，不要扩大无关权限。 |
| Source 检查 | 不同且为真值的 source 被忽略 | 通过已配置 WebView 发送；不要把 null source 当作授权。 |
| Origin 检查 | 已接受的 WebView 没有发生分发 | 用最窄的 `allowedOrigins` 条目匹配真实 origin。 |
| 能力检查 | `BridgeRemoteError` 的 code 为 `ERR_BRIDGE_CAPABILITY_DISABLED`、远程 name 为 `BridgeCapabilityError` | 检查 `operationId`、`capability`、`module` 和 `method`；只添加报告的叶子并重新创建运行时。 |
| 原生权限/API | 来自 UXP/Photoshop 的 `BridgeRemoteError` | 只添加所需清单权限，或处理宿主/API 限制。 |

能力拒绝消息只是诊断文本，不是程序化契约。消息不会包含请求参数、路径、URL、存储键、Photoshop descriptor 或参数摘要。

请查看[UXP](./uxp.md)、[Photoshop](./photoshop.md)和[转发 fetch](./fetch.md)中的功能前置条件。
