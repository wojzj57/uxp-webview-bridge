# Photoshop core 工具与层级查询开发记录

日期：2026-07-12  
环境：Windows、Photoshop 26.10.0、UXP 9.0.1

## 范围

在既有 `photoshop.core` 查询模块上新增：

- `calculateDialogSize`
- `convertColor`
- `getLayerTree`
- `getLayerTreeSync`
- `getLayerGroupContents`
- `getLayerGroupContentsSync`

core 直接运行时覆盖由 12/31 提升到 18/31（58.1%），总体公开表面抽样由 144/353 提升到 150/353（42.5%）。

## 实现与兼容性

- 公共 API 新增 `ColorConversionModel`、颜色 descriptor、对话框尺寸和层级树类型。
- WebView 同步命名的 Photoshop API 仍返回 Promise，因为跨桥 RPC 本质上是异步操作。
- UXP host 对文档/图层 ID、颜色模型、尺寸和结果结构进行边界校验。
- Photoshop 26.10 的层级结果实际使用 `layerKind: number` 和嵌套 `list`，而随附声明使用 `kind: string` 和 `layers`。host 统一输出 `kind`/`layers`，公共 `kind` 类型诚实声明为 `string | number`。
- 实机层级测试创建临时空组，并在 `finally` 中删除，避免污染用户文档。

## 代码质量

第一轮 `code-review` 发现 core host 增长到 361 行且混合调度、参数校验和结果归一化。修正后：

- `host.ts` 只负责方法路由与原生调用，降至 242 行。
- `validation.ts` 集中参数和标量校验。
- `results.ts` 集中版本兼容与传输结果归一化。
- CDP 复用层级断言辅助函数，避免测试主体继续膨胀。

第二轮审查未发现阻断性缺陷，没有显式 `any`、类型忽略、调试输出或危险调用。

## 验证

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过 |
| `pnpm test:contract` | 134 passed、0 failed |
| `pnpm test:uxp -- --case photoshop.core.utility-queries --verbose` | passed |
| `pnpm test:uxp -- --case photoshop.core.layer-hierarchy --verbose` | passed |
| `pnpm test:uxp -- --verbose` | 47 passed、0 failed、2 skipped |

两个跳过项仍为需要外部打开交互的 shell cases，与本轮无关。
