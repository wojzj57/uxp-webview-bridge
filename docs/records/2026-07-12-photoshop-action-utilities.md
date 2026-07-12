# Photoshop action 无状态操作开发记录

日期：2026-07-12
环境：Windows、Photoshop 26.10.0、UXP 9.0.1
文档基线：`uxp-document/ps-reference/media/photoshopaction.md`

## 本轮范围

在现有 `photoshop.action.batchPlay` 基础上新增四个 WebView 远程方法：

- `batchPlaySync`
- `getIDFromString`
- `recordAction`
- `validateReference`

action 文档的运行时覆盖由 1/7 提升为 5/7。剩余 `addNotificationListener` 与 `removeNotificationListener` 需要 host→WebView 事件投递、listener id、取消订阅和销毁清理协议，不适合作为普通请求/响应 RPC 透传，留作独立事件通道开发单元。

## 实现

- shared 协议加入四个 `action.*` 方法名。
- WebView `PhotoshopActions` 加入远程 Promise API，并公开 `ActionReference`、`RecordActionOptions` 类型。
- UXP host 对 action descriptor/reference 保持原样传输，不进入 bridge remote-reference 解码。
- `batchPlaySync` 与 `batchPlay` 一样进入 `executeAsModal`；id/reference 查询不进入 modal。
- `recordAction` 校验显示名称、UXP host 全局 handler 名称和 info 对象。Photoshop 后续回放调用的是 UXP host 全局函数，不是 WebView 回调。

## 文档与实机差异

`photoshopaction.md` 把 `batchPlaySync` 列在 action 模块；同仓库 changelog 将它标为 Core Module API。Photoshop 26.10 实机中，`action.batchPlaySync` 与 `core.batchPlaySync` 均不存在。

WebView 跨桥调用本身始终异步，因此 host adapter 使用以下兼容顺序：

1. 若 `action.batchPlaySync` 存在则直接调用。
2. 否则若 `core.batchPlaySync` 存在则调用该版本位置。
3. 两者都不存在时，调用 `action.batchPlay` 并强制 `synchronousExecution: true`。

实机走第 3 条路径并成功返回当前文档 descriptor。`validateReference` 同样兼容 action/core 的版本位置。

## 测试与审查

- Contract tests 覆盖四个 WebView RPC、协议方法集、host 原生路径、`batchPlaySync` 兼容回退、modal 边界和坏参数拒绝。
- CDP `photoshop.action-utilities` 实机验证同步 descriptor 读取、action string id 稳定性和当前文档引用有效性。
- `recordAction` 未在全量自动化中启动真实 Actions panel 录制，以避免修改用户 Action；其 RPC/host 行为由 contract tests 覆盖，公开方法形状由 CDP 覆盖。
- 使用 `code-review` 完成两轮审查；修正了 batchPlaySync 版本归属表述，并明确 recordAction handler 位于 UXP host。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 130 passed、0 failed |
| `pnpm test:uxp -- --case photoshop.action-utilities --verbose` | passed |
| `pnpm test:uxp -- --verbose` | 42 passed、0 failed、2 skipped |

剩余两个跳过项仍为 `uxp.shell-open-external` 与 `uxp.shell-open-path`，与本轮 Photoshop action 改动无关。
