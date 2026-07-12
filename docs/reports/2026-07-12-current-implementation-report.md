# UXP WebView Bridge 当前实现报告

报告日期：2026-07-12  
验证环境：Windows、Photoshop 26.10.0、UXP 9.0.1  
代码基线：`master`，包含本报告生成时的 core 工具与层级查询工作树

## 当前结论

项目已具备可用的 WebView ↔ Adobe UXP 双向请求/响应桥接主干。WebView 只暴露远程 Promise API，真实 UXP、Photoshop、文件系统和宿主调用均在 UXP adapter 执行；shared 仅承载协议、传输形状、错误与运行时中立工具。

最新离线门禁全部通过，真实 Photoshop 全量结果为 **47 passed、0 failed、2 skipped**。两个跳过项都是需要外部打开交互的 `uxp.shell` 场景，不影响桥接核心能力。

## 已实现能力

### 桥接基础设施

- origin 与 capability 校验、请求 dispatch、远端错误元数据和 operation id。
- cancel/AbortSignal 传递、WebView queued property writes、稳定远端对象 identity。
- 二进制 inline/base64 transport envelope 与临时资源 handle 生命周期。
- WebView/UXP setup API：`configWebviewBridge` 与 `configUxpBridge`。

### UXP 与 Web 平台代理

- `fs`、`os`、`path`、转发 `fetch` 与 fetch 安装/恢复。
- clipboard、crypto、local/session storage。
- `uxp.host`、versions、shell、userInfo、pluginManager、secureStorage、localFileSystem 与 XMP。

### Photoshop

- Photoshop app 入口及 Document、Layer、Channel、集合和 SolidColor 的已闭合子集。
- action：7 个文档函数中实现 5 个；通知监听器仍需 host→WebView 事件通道。
- imaging：8 个模块函数与 imageData `getData`/`dispose` 均已实现，使用显式资源 handle。
- core：31 个文档成员中实现 18 个，包括环境/菜单/历史查询、颜色转换、对话框尺寸和同步/异步层级树查询。
- 所有 Photoshop 修改操作由 UXP host 控制 modal 语义；本轮 core 工具和层级查询均不进入 modal。

## Photoshop Reference 覆盖率

| 范围 | 已覆盖 | 文档成员 | 覆盖率 |
| --- | ---: | ---: | ---: |
| DOM/集合/SolidColor/action/imaging 抽样 | 125 | 222 | 56.3% |
| constants | 7 | 100 | 7.0% |
| photoshop.core | 18 | 31 | 58.1% |
| **合计抽样** | **150** | **353** | **42.5%** |

这里的“覆盖”只统计能从 WebView 通过桥接真实调用或读取的公开成员；仅存在 `.d.ts` 不计入运行时覆盖。该数字是明确清单的抽样，不代表 125 个 Markdown 页面逐页全覆盖。

## 当前架构质量

- WebView 与 UXP Photoshop 模块保持对称目录，静态边界检查通过。
- shared 不包含具体 `require("photoshop")`、`uxp`、`fs` 或 `os` 实现。
- core 使用独立模块；调度、参数校验、结果归一化分别位于 `host.ts`、`validation.ts` 和 `results.ts`。
- UXP 边界兼容 Adobe 文档、声明和真实宿主漂移，包括 `classID/classId`、菜单 scalar/tuple，以及层级树 `kind/layers` 对 `layerKind/list`。
- 新增公开类型均使用静态 assignability 断言对照仓库内 Adobe 声明；已知漂移字段被显式排除并以兼容类型表达。

## 验证基线

| 门禁 | 最新结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过 |
| `pnpm test:contract` | 134/134 passed；命令内执行 build |
| `pnpm build` | 通过 |
| `pnpm test:uxp -- --verbose` | 47 passed、0 failed、2 skipped |

新增 core 实机证据：

- `photoshop.core.utility-queries`：对话框尺寸 200×300，RGB→Lab 转换返回有效 luminance。
- `photoshop.core.layer-hierarchy`：同步/异步树均包含临时组，group contents 均为空，测试结束后成功清理。
- `photoshop.core.public-shape`：检查 18 个公共成员。

## 主要剩余缺口

1. RFC-0001/0002/0003 点名的部分 cancel、fetch body/header 和 install/uninstall contract tests 尚未补齐。
2. Photoshop 类型别名仍存在历史路径问题，部分公开类型需要本地镜像和静态一致性断言。
3. core 剩余 13 个成员涉及事件订阅、`executeAsModal` 回调、临时文档资源、菜单/UI 副作用或开发模式设置，需要分别设计生命周期和安全测试。
4. Document/Layer 仍有 Selection、history、guide、path、text、group/filter 等大块 ps-reference 表面未覆盖。
5. RFC 状态元数据仍与已实现提交不同步。

## 建议下一步

优先完成 core 中资源边界清晰的 `createTemporaryDocument`/`deleteTemporaryDocument` 对，并设计 host 超时清理；随后补齐 RFC-0001/0002/0003 的验收测试。事件监听器和 `executeAsModal` 不应作为普通 RPC 直接透传，应分别建立订阅 id/销毁协议与 host-side modal callback 模型。
