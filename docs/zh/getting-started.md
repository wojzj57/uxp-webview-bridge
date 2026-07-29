[English](../getting-started.md)

# 快速开始

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

## 前置条件与包可用性

你需要一个包含 WebView 的 Adobe UXP 插件、彼此独立的 UXP 宿主和 WebView bundle，并且能控制边界两侧。从公共 npm registry 安装该包：

```powershell
pnpm add uxp-webview-bridge
```

仓库贡献者使用以下命令在本地构建：

```powershell
pnpm install
pnpm build
```

请将该包的 `/uxp` 和 `/webview` 入口分别打包到对应的运行时。在本地 pnpm workspace 中，也可以使用 `workspace:*` 协议链接该包。

## 1. 添加本地 WebView

仓库 fixture 从插件本地内容加载页面。本地渲染要求 UXP 8.0 或更高版本，并需要对应的清单权限：

```html
<webview id="plugin-webview" src="plugin:/webview/index.html"></webview>
```

```json
{
  "requiredPermissions": {
    "webview": {
      "allow": "yes",
      "allowLocalRendering": "yes",
      "enableMessageBridge": "localAndRemote"
    }
  }
}
```

这是与 fixture 形式一致的片段，不是通用的生产最小配置。请根据目标 Adobe 宿主/版本补全清单，并选择应用真正需要的最窄权限。远程 WebView 内容还需要合适的 WebView 域策略和显式的桥接来源策略；请参阅[安全与权限](./security-and-permissions.md)。

## 2. 配置唯一的 UXP 宿主运行时

应在 WebView 调用命名空间前配置宿主。示例只使用公共 UXP 子路径并保留全部启用的默认能力，因为该流程仅读取 `os` 和不可配置门禁的 UXP 版本属性。对于远程或其他不受信任的内容，应显式配置全部 capability 键并禁用所有未使用接口。

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";

interface PluginWebViewElement extends Element {
  postMessage(message: unknown): void;
}

function isPluginWebViewElement(element: Element | null): element is PluginWebViewElement {
  return element !== null && "postMessage" in element && typeof element.postMessage === "function";
}

const webview = document.querySelector("#plugin-webview");
if (!isPluginWebViewElement(webview)) {
  throw new Error("The plugin WebView is missing or does not support postMessage().");
}

const hostRuntime = configUxpBridge({
  webview,
  allowedOrigins: ["plugin:"]
});

window.addEventListener("unload", () => hostRuntime.destroy(), { once: true });
```

每个 WebView 只能创建一个宿主运行时。再次调用 `configUxpBridge()` 会增加另一个消息监听器，而不会替换第一个运行时。重新配置或移除 WebView 前，应先销毁旧运行时。

## 3. 配置唯一的 WebView 客户端并发起调用

首次远程操作前先配置 WebView 客户端。已配置的客户端是模块全局状态，因此应由一个应用组件负责设置和销毁。

```ts
import { configWebviewBridge, os, uxp } from "uxp-webview-bridge/webview";

const webviewRuntime = configWebviewBridge({ timeoutMs: 10_000 });

try {
  const [platform, uxpVersion] = await Promise.all([
    os.platform(),
    uxp.versions.uxp
  ]);
  console.log({ platform, uxpVersion });
} finally {
  webviewRuntime.destroy();
}
```

默认请求超时为 10 秒。再次调用 `configWebviewBridge()` 会销毁并替换当前客户端，同时拒绝该客户端所有未完成的请求。虽然命名空间层可以延迟创建客户端，但显式设置能让超时配置和所有权保持清晰。

## 生命周期所有权

- **一个 WebView 客户端所有者：**配置并销毁唯一的模块全局客户端。重新配置是替换操作，不是叠加设置。
- **每个 WebView 一个宿主运行时：**保留其运行时并确定性销毁。重复宿主设置可能产生重复监听器和响应。
- **一个全局 fetch 所有者：**使用 `installFetch()` 时不要重叠安装。它没有引用计数，任何仍活动的卸载器都可能恢复捕获到的旧全局 fetch。

页面销毁前先销毁 WebView 客户端；移除或替换 WebView 元素前先销毁 UXP 宿主运行时。

## 故障排除

| 现象 | 检查项 |
| --- | --- |
| 缺少 `window.uxpHost` | 确认页面运行在启用了消息桥的 UXP WebView 中，而不是普通浏览器标签页。 |
| 请求超时 | 确认先配置了宿主运行时、目标正确，并且操作能在 `timeoutMs` 内完成（默认 10 秒）。 |
| 宿主忽略消息 | 不同且为真值的 `event.source` 会被拒绝。缺失/null source 会继续接受来源验证，而不是绕过验证直接接受。 |
| 来源被拒绝 | 让 `allowedOrigins` 与规范化后的事件来源匹配。以 `:` 结尾的 scheme 条目按前缀匹配，其他值必须匹配精确的规范化 origin。内置本地和回环来源无需重复添加。 |
| 能力错误 | 只启用实际控制该命名空间的能力。所有可配置能力默认启用，因此应显式禁用未使用接口。 |
| 原生权限错误 | 添加相关 UXP 清单权限；桥接能力不会授予原生权限。 |
| `BridgeRemoteError` | 检查远程 name/message/stack/code 和 `operationId`；原生操作在跨桥后失败。 |
| 设置期间出现 `Bridge request <operationId> was cancelled.` | 另一个所有者在有未完成操作时替换了模块全局 WebView 客户端。 |
| 重复处理或响应 | 同一 WebView 可能有多个宿主运行时在监听。销毁重复实例并建立唯一所有者。 |
| 全局 fetch 意外恢复 | 多个 `installFetch()` 所有者发生重叠。应使用单一所有者和一个 `try/finally` 清理边界。 |

启用远程内容或广泛原生操作前，请继续阅读[安全与权限](./security-and-permissions.md)。
