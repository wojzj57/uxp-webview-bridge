[English](../fetch.md)

# 转发 fetch

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

**转发 fetch** 接受常见的 WebView `fetch(input, init)` 形式，序列化请求，使用 UXP 宿主的全局 fetch 发起真实请求，再在 WebView 中重建原生 `Response`。因为请求由宿主发起，所以不受 WebView CORS 执行限制；但仍受 UXP 清单网络权限和桥接信任边界限制。

转发 fetch 由默认启用的 `fetch` 桥接能力控制。当 WebView 不需要宿主转发的网络访问时，应显式禁用它；也不要向不受信任的 WebView 来源开放它。

## 直接使用

先配置 WebView 桥，再以含义明确的本地名称导入 `fetch`。

```ts
import {
  configWebviewBridge,
  fetch as forwardedFetch
} from "uxp-webview-bridge/webview";

const runtime = configWebviewBridge();

try {
  const response = await forwardedFetch("https://example.com/data.json", {
    headers: { Accept: "application/json" },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  console.log(await response.json());
} finally {
  runtime.destroy();
}
```

UXP 清单必须允许目标网络域。避免把秘密放入 URL 或日志。

## 中止请求

`AbortSignal` 会为进行中的操作发送桥接 cancel envelope。跨传输层和宿主 fetch 边界的中止是 best effort。

```ts
import { fetch as forwardedFetch } from "uxp-webview-bridge/webview";

const controller = new AbortController();
const request = forwardedFetch("https://example.com/slow", {
  signal: controller.signal
});

controller.abort();

try {
  await request;
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.log("Request aborted");
  } else {
    throw error;
  }
}
```

## 安装为全局 fetch

`installFetch()` 需要显式启用。它会修改模块全局安装状态和 `globalThis.fetch`，并返回一个用于恢复捕获到的旧全局值的卸载器。同一时间只能有一个全局所有者，并应使用确定的 `try/finally` 边界。

```ts
import {
  configWebviewBridge,
  installFetch
} from "uxp-webview-bridge/webview";

const runtime = configWebviewBridge();
const uninstallFetch = installFetch();

try {
  const response = await globalThis.fetch("https://example.com/data.txt");
  console.log(await response.text());
} finally {
  uninstallFetch();
  runtime.destroy();
}
```

安装没有引用计数。重叠所有者无法独立卸载：任何仍活动的卸载器都可能为所有所有者恢复捕获到的旧全局值。依赖浏览器特有 fetch 细节的库仍可能不兼容。

## 支持的请求形式

实现和公共类型支持：

- string、`URL` 和 `Request` 地址输入；
- method 和 header 覆盖；
- 通过 `init.body` 提供的 text、`URLSearchParams`、`FormData`、`Blob`、`ArrayBuffer` 和 `ArrayBufferView` body；
- 提供时使用 `follow`、`error` 和 `manual` redirect mode；
- 通过 `AbortSignal` 传播中止。

当前契约测试实际覆盖 string 输入、通过 `init` 提供的 text、`URLSearchParams` 和 `FormData` body、来自 `init.body` 的 `ReadableStream` 拒绝、响应重建、失败映射和中止行为。上述其他支持形式来自实现和公共类型，并没有逐一对应的形式测试。

支持的 body 必须通过 `init.body` 提供。`Request` 输入只提供其 URL、method 和 headers；它的 body 不会被转发。通过 `init.body` 提供的 `ReadableStream` 会被拒绝。

桥会使用传输的 status、status text、headers 和缓冲 body 重建原生 WebView `Response`，供普通 body 消费方法使用。

## 限制与错误行为

> **缓冲警告：**支持的请求 body 和响应 body 都会完整缓冲到内存，也不支持流式响应。应根据 UXP 进程和 WebView 内存预算限制 payload 大小。

传输或远程请求失败会映射为 `TypeError`，并将远程失败附加到 `cause`。在环境支持时，中止失败保留中止语义。可以检查 `cause` 进行诊断，但不要暴露秘密。

转发 fetch **不**声明完整 Fetch Standard 一致性。尤其不能假设存在流式传输、浏览器 cookie/credential 等价行为、浏览器缓存语义，或传输未携带的 response URL/type/redirect 元数据。

## 安全检查清单

- 在 `requiredPermissions.network` 中只允许所需域；仓库 fixture 中广泛的 `"all"` 值仅供测试。
- 缩小 `allowedOrigins` 和 WebView 域策略；除非 WebView 需要宿主转发请求，否则禁用 `fetch` 能力。
- 在应用边界验证调用者控制的 URL、method、headers 和 body。
- 避免为不受信任内容转发凭据，并且不要在 URL/日志中放置秘密。
- 应用自有代码优先直接使用 `forwardedFetch`。只有依赖确实要求、且某个组件能拥有完整生命周期时才使用全局安装。
