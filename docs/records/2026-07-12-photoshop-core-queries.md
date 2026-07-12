# Photoshop core 查询桥接开发记录

日期：2026-07-12  
环境：Windows、Photoshop 26.10.0、UXP 9.0.1  
文档基线：`uxp-document/ps-reference/media/photoshopcore.md`

## 本轮范围

新增 WebView 公共 `photoshop.core` namespace，并实现 12 个只读或查询成员：

- `apiVersion`
- `getActiveTool`
- `getCPUInfo`
- `getDisplayConfiguration`
- `getGPUInfo`
- `getMenuCommandState`
- `getMenuCommandTitle`
- `getPluginInfo`
- `getUserIdleTime`
- `historySuspended`
- `isModal`
- `translateUIString`

core 文档的直接运行时覆盖由 0/31 提升到 12/31（38.7%）；纳入既有 DOM、action、imaging 和 constants 抽样后，总覆盖由 132/353 提升到 144/353（40.8%）。

## 设计与实现

- shared 新增独立 core 方法协议，只允许上述 12 个方法名。
- WebView 与 UXP 使用对称的 `photoshop-api/modules/core` 目录；公共类型和 Promise 代理位于 WebView，真实 Photoshop 调用与输入/输出校验位于 UXP。
- `photoshop.core` 接入既有 Photoshop namespace，UXP adapter 通过 `photoshop` capability 门禁注册。
- 所有成员均为查询路径，不进入 `executeAsModal`；后续 modal、事件监听、redraw 等成员留给具有相应生命周期和执行语义的开发单元。
- core 使用独立 host adapter，没有继续扩大已有 DOM host 文件，保持模块职责和 WebView/UXP 对称边界。

## 文档与实机差异

本轮在 UXP 边界归一化了两类版本差异：

- `getActiveTool` 文档字段为 `classID`，随附声明和部分宿主版本使用 `classId`；WebView 始终返回文档形式 `classID`。
- 菜单状态和标题在声明/宿主版本间可能返回标量或单元素 tuple；WebView 始终返回 `boolean` 或 `string`。

菜单 command/menu ID 与 document ID 在进入原生 API 前校验为整数，避免无效值传播到 Photoshop 宿主。

## 测试与代码审查

- Contract tests 覆盖 12 个协议方法、逐方法 RPC 映射、host 结果归一化、非 modal 语义及坏参数拒绝。
- CDP 新增 `photoshop.core.public-shape`、`photoshop.core.environment-queries` 和 `photoshop.core.document-queries`。
- 12 个成员全部经过 Photoshop 26.10.0 / UXP 9.0.1 实机调用；环境查询返回 CPU/GPU/display/plugin/tool 信息，文档查询验证 history 与菜单结果。
- 使用 `code-review` 完成两轮审查。首轮发现 CDP 辅助类型中的显式 `any` 和过长的 host 分发函数；第二轮已移除 `any`、按查询职责拆分分发，并收紧 ID 校验。未发现阻断性缺陷。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过 |
| `pnpm test:contract` | 134 passed、0 failed |
| `pnpm test:uxp -- --case photoshop.core.environment-queries --verbose` | passed |
| `pnpm test:uxp -- --case photoshop.core.document-queries --verbose` | passed |
| `pnpm test:uxp -- --verbose` | 45 passed、0 failed、2 skipped |

两个跳过项仍为 `uxp.shell-open-external` 与 `uxp.shell-open-path`，均涉及外部打开交互，与 core 改动无关。
