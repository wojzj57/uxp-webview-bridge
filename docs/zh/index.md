[English](../index.md)

# UXP WebView Bridge 概览

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

## 此桥接库的作用

`uxp-webview-bridge` 让 WebView 能以受控方式访问其所属 Adobe UXP 插件中才有的功能。WebView 获得易用的命名空间和远程对象，而宿主负责验证、分发、原生 API 和资源句柄。

```text
WebView namespace -> WebView RPC client -> window.uxpHost message bridge
-> UXP host validation/capability dispatch -> native UXP or Photoshop implementation
-> serialized result/error -> WebView value, Response, or RemoteObject
```

包提供两个公共运行时入口：

| 运行时 | 导入 | 职责 |
| --- | --- | --- |
| UXP 宿主 | `uxp-webview-bridge/uxp` | 配置目标 WebView、允许的来源、能力、分发和清理。 |
| WebView | `uxp-webview-bridge/webview` | 配置 RPC 客户端并调用导出的远程命名空间。 |

此库面向同时控制 WebView 边界两侧的插件作者。它不是应用外壳、仅浏览器使用的包、Node 服务，也不能替代完整的 Adobe API 参考文档。

## WebView 公共接口

| 命名空间 | 用途 |
| --- | --- |
| `clipboard` | 将部分剪贴板操作转发到 UXP。 |
| `crypto` | 使用已导出的 UXP 加密全局对象。 |
| `fetch` | 在 UXP 宿主中执行完整缓冲的转发 fetch。 |
| `fs` | 在能力和清单权限允许时使用直接文件系统适配器。 |
| `localStorage`, `sessionStorage` | 访问对应的 UXP 存储全局对象。 |
| `os`, `path` | 读取操作系统信息并使用路径辅助函数。 |
| `photoshop` | 使用已实现的 Photoshop DOM、Action、Core、Imaging、常量和辅助函数。 |
| `uxp` | 使用 host、plugin manager、shell、storage、user information、versions 和 XMP。 |

这里的“支持”是指公共导出、TypeScript 类型和契约测试所描述的已实现子集，并不表示与所有 UXP、Photoshop、Node 或浏览器成员完全兼容。

## 选择指南

1. [快速开始](./getting-started.md) 连接本地 WebView，并建立确定的生命周期所有权。
2. [安全与权限](./security-and-permissions.md) 区分清单权限、消息验证和桥接能力。
3. [UXP](./uxp.md) 介绍 Promise 属性、存储、shell 操作和资源清理。
4. [Photoshop](./photoshop.md) 解释远程对象、排队写入、模态执行和 imaging 句柄。
5. [转发 fetch](./fetch.md) 介绍直接和全局用法、中止、安全性、缓冲及限制。

`package.json` 将该包标记为私有，且仓库没有提供受支持的注册表安装方式。请参阅快速开始，了解仓库构建流程和已验证的本地 `plugin:/` fixture 形式。
