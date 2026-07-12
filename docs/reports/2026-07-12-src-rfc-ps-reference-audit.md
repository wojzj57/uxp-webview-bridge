# `src` 开发情况、RFC 符合度与 Photoshop Reference 覆盖审查

审查日期：2026-07-12  
审查对象：当前工作树（RFC-0010 已由 `8f044dc` 提交；包含本轮 clipboard 实机兼容改动）
范围：`src/`、`test/`、`docs/rfcs/`、`uxp-document/ps-reference/`

## 结论摘要

当前代码已经形成可工作的桥接主干：WebView/UXP/shared 边界清楚，RPC 取消、转发 fetch、Photoshop Document/Layer/Channel、`batchPlay`、声明式注册表和 imaging 均已有实现。离线门禁全部通过：`pnpm typecheck`、`pnpm test:static`、CDP TypeScript 编译、`pnpm build` 以及 125 个 contract tests 均为绿色。

真实 Photoshop 宿主验证已经补齐：在 Photoshop 26.10.0 / UXP 9.0.1 上，`pnpm test:uxp` 最新结果为 **41 passed、0 failed、2 skipped**。clipboard 文本往返现已真实通过；剩余跳过项仅为需要外部打开交互的 shell cases。因此 RFC-0005 至 RFC-0011 的 DOM、modal、identity、Channel/SolidColor、batchPlay 和 imaging 关键路径已有实机证据。仍不能认定所有 RFC 均完成全部验收：RFC-0001/0002/0003 的部分明确 contract 项尚未补齐。

Photoshop 文档覆盖应分三层看：

- 类型镜像层：`src/shared/types/photoshop` 有 69 个 `.d.ts` 文件，48 个非索引 class 文档中有 45 个能按类名找到对应声明文件；这表示类型资料较全，不表示可跨桥调用。
- 直接运行时层：目前主要实现 `Photoshop app` 的 3 个成员、Document 子集、Layer 子集、完整 Channel、部分集合、部分 SolidColor、`action.batchPlay` 和几乎完整 imaging。
- 量化抽样：对 DOM/集合/SolidColor/imaging/action 这 9 组主要公开清单逐成员比对，严格按文档名称计算为 **121/222（54.5%）**；再把 100 个常量枚举和 31 个 `photoshop.core` 成员纳入，则为 **128/353（36.3%）**。本次补齐 `Channels.add()`，运行时覆盖增加 1 个成员。这只是明确列出的核心公开表面，不是对 125 个 Markdown 页面逐页宣称的全库覆盖率。

## 主要发现（按优先级）

### 已关闭：真实 Photoshop 验证缺口

2026-07-12 已在 Photoshop 26.10.0 / UXP 9.0.1 上完成全量 `pnpm test:uxp`：41 passed、0 failed、2 skipped。通过项包括 clipboard 文本往返、DOM 读写、`executeAsModal` 路径、Document/Layer identity、Channel/SolidColor、`batchPlay` native id 写入、imaging typed-array round-trip、base64 encode 和 dispose 后错误。2 个跳过项仅为需要外部打开交互的 shell open cases。

实机运行同时发现并修复了测试基础设施的 classic bundle 符号碰撞和 CDP `Promise was collected` 轮询问题；详细记录见 `docs/records/2026-07-12-uxp-live-test-fixes.md`。

### P1：RFC-0001/0002/0003 的验收测试覆盖不完整

实现代码存在，但 RFC 中点名的部分测试没有自动化证据：

- RFC-0001：`test/contract/bridge-cancel.test.mjs` 只验证 signal 进入 module registry、WebView 发出 cancel 与 `callCancelable` operation id；没有直接实例化 `RpcHost` 验证“已知请求被 abort、未知/已结束 id 无害、忽略 signal 的调用正常结束、非法 origin 的 cancel 被拒绝”。
- RFC-0002：fetch contract 覆盖 string、URLSearchParams、FormData、ReadableStream、Response、错误映射和 abort，但没有逐项覆盖 RFC 指定的 Blob、Uint8Array、ArrayBuffer、HTTP 500 正常 resolve、重复 header。
- RFC-0003：仅验证 `installFetch` 被公开导出，没有验证全局 fetch 确实被替换、uninstall 恢复原值、重复安装不丢失真实原值。

这些是验收证据缺口，不代表当前实现一定错误；但按 RFC 的 Testing 小节，不能标记为完全满足。

### P2：RFC 状态元数据已失真

11 份 RFC 的头部仍全部标为 `Status: ready-for-agent`，而 Git 历史已经包含 RFC-0008、0009、0010、0011 等明确提交。状态失真会让后续 agent 重复实施或错误判断依赖关系。建议定义并统一使用 `implemented`、`verified-offline`、`verified-live`、`superseded` 等状态，同时记录对应 commit 与最后验证日期。

### P2：Adobe 类型别名损坏导致公开类型采用本地镜像

`tsconfig.json` 中 `@shared-types/photoshop/*` 指向不存在的 `src/shared/types/photoshop/src/*`。当前代码通过可工作的 `@shared/types/photoshop/internal/...` 做 type-only compatibility assertions，但 `ActionDescriptor`、`BatchPlayCommandOptions` 和 imaging options/results 仍在 WebView types 内重新声明，而不是 RFC-0009/0010 要求的“直接 re-export Adobe types”。现有静态断言降低了漂移风险，却没有完全消除双写成本；imaging 的 bounds/imageData 差异还被刻意从 scalar compatibility comparison 中排除。

建议先修复稳定的公开类型入口/别名，然后用 `Omit`/替换字段的方式从 Adobe 类型派生代理类型，减少手工镜像。

### P2：ps-reference 与随附声明在 `chunky` 命名上不一致

`media/imaging.md` 把 `PhotoshopImageData` 属性写作 `isChunky`，而随附 `ImagingModule.d.ts`、当前 `PsImageData` 与 host serialization 使用 `chunky`。按文档文字严格计数时 metadata 为 9/10；按仓库内 Adobe 声明计数则为 10/10。应选定权威来源并在报告/用户文档说明版本差异，避免调用方按 Markdown 使用 `isChunky`。

### 已关闭：RFC-0010 未提交状态

RFC-0010 已完成实机验证、review，并拆分为 binary transport 重构 `8710137` 与 Photoshop imaging 功能 `8f044dc` 两个独立提交；其 live-host 兼容修复另见 `a958329`。原“未提交工作树”风险已经关闭。

## RFC 符合度矩阵

状态含义：

- `实现完成`：核心设计在当前代码中存在，离线证据与 RFC 一致；
- `实现完成/验收缺口`：代码存在，但 RFC 指定测试或实机门禁未完成；
- `开发中`：当前工作树实现存在但尚未提交或仍缺最终证据。

| RFC | 当前判断 | 主要实现证据 | 未满足/未证实项 |
| --- | --- | --- | --- |
| 0001 bridge.cancel | 实现完成/验收缺口 | `shared/protocol.ts` cancel envelope；`webview/rpc-client.ts` cancel/callCancelable；`uxp/rpc-host.ts` in-flight AbortController | RFC 点名的 4 类 RpcHost 行为测试缺失 |
| 0002 forwarded fetch | 实现完成/验收缺口 | shared fetch protocol；WebView normalization/Response；UXP adapter；public export | Blob/typed-array/HTTP error/duplicate-header 等逐项测试不全 |
| 0003 installFetch | 实现完成/验收缺口 | `webview/fetch/install.ts` + public export | 安装、恢复、重复安装 3 个行为测试缺失 |
| 0004 Photoshop shared protocol/constants | 实现完成 | protocol method set、remote/result kinds、7 个 transcribed constants、静态 Adobe enum compatibility | RFC 元数据仍为 ready-for-agent；新增 ChannelType 是合理的后续扩展 |
| 0005 Photoshop WebView module | 实现完成 | Document/Layer RemoteClass、queued writes、collections、identity registry、public namespace；相关 CDP 实机通过 | 实际表面是 RFC 闭合集而非完整 ps-reference |
| 0006 Photoshop UXP host adapter | 实现完成 | capability adapter、独立 registry、参数/引用 dispatch、modal wrapping、serialization；真实 DOM/modal case 通过 | 无本次阻断项 |
| 0007 tests & verification | 实现完成 | static type assertions、contract registry consistency、Photoshop DOM/action CDP cases；全量实机 41/0/2 | RFC 状态元数据仍未更新 |
| 0008 declarative registries | 实现完成 | value object registry、snapshot collection、type registry、declarative result kinds；contract no-dangling 与实机 identity/value/collection case 通过 | 无本次阻断项 |
| 0009 batchPlay | 实现完成 | one-RPC WebView passthrough、host shape validation + modal、contract tests、实机 native-id read/write roundtrip 通过 | 类型仍为本地镜像而非直接 re-export |
| 0010 binary + imaging | 实现完成（已实机验证） | commit `8f044dc`；shared binary codec；fs/crypto/fetch refactor；独立 imaging adapter/registry；8 API + imageData handle；contract 与全部 imaging CDP case 通过 | PsImageData 使用独立模块代理而非 RFC-0008 DOM type registry（与独立 adapter/registry 推荐一致，但偏离文字验收项） |
| 0011 Channel + SolidColor | 实现完成 | commit `7e82099`；Channel descriptors/host branches；SolidColor value kind；ChannelType；4 个 CDP cases 实机通过；补齐 `Channels.add` | Channel 无稳定 id，当前明确采用非去重 handle |

## Photoshop Reference 覆盖统计

### 口径

“覆盖”只在公开 WebView API 能通过桥调用或返回对应值时计入；仅有 `.d.ts` 不计为运行时覆盖。属性、方法按文档顶层成员计数；Document 的 `saveAs.bmp/jpg/...` 视为 `saveAs` 一个顶层属性。`batchGet`、`batchSet`、`dispose` 等桥自身能力若不在 Adobe 文档中，不放入分子。额外实现但文档中没有的 `Layer.selected` 也不提高分子。

### DOM/集合/值对象

| 文档表面 | 文档成员 | 已覆盖 | 覆盖率 | 主要缺口 |
| --- | ---: | ---: | ---: | --- |
| Photoshop class | 18 | 3 | 16.7% | 仅 `activeDocument`、`documents`、`open`；其余 app 属性/方法未桥接 |
| Document | 66 | 39 | 59.1% | Selection、history、guides、path items、color samplers、saveAs、mode/profile、sampleColor、suspendHistory 等 |
| Layer | 83 | 36 | 43.4% | group `layers`、textItem、typename、大量 `apply*` filters、copy/cut/clear、front/back/skew 等 |
| Layers | 4 | 3 | 75.0% | `typename` 未公开 |
| Channel | 10 | 10 | 100% | 文档列出的属性与方法均有桥表面；实机未验证 |
| Channels | 6 | 4 | 66.7% | `parent`、`typename`、`removeAll` 未公开；`add` 已补齐并实机验证 |
| SolidColor | 8 | 6 | 75.0% | `nearestWebColor`、`isEqual` 未实现；构造器亦不在当前 RFC 范围 |
| **小计** | **195** | **101** | **51.8%** | — |

### Action 与 Imaging

| 文档表面 | 文档成员 | 已覆盖 | 覆盖率 | 说明 |
| --- | ---: | ---: | ---: | --- |
| photoshop.action functions | 7 | 1 | 14.3% | 仅 `batchPlay`；通知、sync、recordAction、validateReference 等未实现 |
| Imaging API functions + handle methods | 10 | 10 | 100% | 8 个 imaging 函数 + `getData`/`dispose` 均已实现 |
| PhotoshopImageData metadata | 10 | 9（文档严格）/10（`.d.ts`） | 90%/100% | `isChunky`（Markdown）与 `chunky`（声明/实现）命名差异 |

把上述 DOM/集合/值对象、Action、Imaging 合并，严格按 Markdown 名称为 **121/222（54.5%）**。

### Constants 与 core

- `modules/constants.md` 有 100 个枚举，当前公开 7 个：`SaveOptions`、`AnchorPosition`、`BlendMode`、`LayerKind`、`ElementPlacement`、`FlipAxis`、`ChannelType`，覆盖 **7.0%**。
- `media/photoshopcore.md` 有 1 个属性和 30 个函数，当前没有作为 WebView 公共 `photoshop.core` namespace 暴露，直接覆盖 **0/31**。host 内部使用 `executeAsModal` 不等于公开覆盖。
- 将 constants/core 一并加入上面的公开表面抽样后为 **128/353（36.3%）**。

### 页面与类型镜像说明

`ps-reference` 共 125 个 Markdown 文件，其中包含 changelog、known issues、教程、媒体与索引页，不能把“实现页面数 / 125”当作 API 覆盖率。类型镜像共有 69 个 `.d.ts`；按 basename 检查，48 个非索引 class 文档中 45 个有同名类型文件（Action、ActionSet、WarpStyle 为例外），但很多 object/options 类型被聚合在较大的 `.d.ts` 中，因此 basename 统计既不是完整语义审计，也不能证明运行时支持。

## 架构与代码质量观察

符合项目边界的部分：

- `src/webview` 与 `src/uxp` 的 Photoshop/imaging 目录保持对称，静态边界检查通过。
- WebView 没有直接执行 Photoshop/UXP API；真实调用集中在 UXP adapter。
- shared 的 binary/protocol/value object 均保持 runtime-neutral，没有 concrete `require("photoshop")` 实现。
- RemoteClass write queue、BridgeRemoteError、stable Document/Layer ids、transient imaging handles、modal flags等核心语义均有清晰代码落点。
- 当前 contract suite 对 registry completeness、descriptor/result-kind sync、writable-only batch、binary round-trip 和 handle lifecycle 提供了较强离线保护。

仍需控制的风险：

- 本地 host interface 与 Adobe declarations 双写，未来 Photoshop SDK 更新时可能漂移。
- Channel 明确不做 identity dedup；调用方必须知道同一 native Channel 多次读取不保证 `===`。
- `ps-reference` 本身与声明存在版本差异，覆盖报告应固定文档/SDK 版本。
- 所有 RFC 的状态字段未纳入交付流程，当前只能依赖 Git 历史和代码反推进度。

## 建议的下一步顺序

1. 补齐 RFC-0001/0002/0003 的明确 contract tests，特别是 RpcHost cancel origin/lifecycle 和 installFetch restore/idempotency。
2. 修复 Photoshop type alias，并从 Adobe 类型派生 batchPlay/imaging public proxy types。
3. 更新 RFC 状态与 commit/verification metadata，记录 Photoshop 26.10.0 / UXP 9.0.1 验证基线。
4. 按 roadmap 继续扩展时，优先补高价值对象簇：Document 的 Selection/history/guide/path 入口、Layer group/text/filter，或把 `photoshop.core`/action 其余成员作为独立 RFC；每批继续使用“成员清单 + host/webview 对称 + live CDP”验收。

## 本次验证记录

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过（Static boundary checks passed） |
| `pnpm exec tsc -p tsconfig.cdp-webview.json` | 通过 |
| `pnpm test:contract` | 通过；125/125 tests，且命令内重新执行 build |
| `pnpm build` | 通过（由 `test:contract` 执行） |
| `pnpm test:uxp` | 通过；Photoshop 26.10.0 / UXP 9.0.1，41 passed、0 failed、2 skipped |

## 审查限制

本报告是对 2026-07-12 当前工作树的静态、构建、离线契约和 Photoshop 26.10.0 / UXP 9.0.1 实机审查。实机结论只证明该版本组合与当前测试夹具覆盖的路径，不把类型声明存在等同于运行时覆盖。
