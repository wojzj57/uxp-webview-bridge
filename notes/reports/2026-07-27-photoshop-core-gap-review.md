# Photoshop Core 缺失审查（2026-07-27）

## 审查结论

**REVIEW_COMPLETE：原报告关于 Photoshop Core 的核心判断准确，当前精确覆盖仍为 18/31，缺失 13 项。**

本次审查以当前 `main` 工作树 `9016989a2bddf0a52b987b25c9095778a92122cd` 为实现基线，并交叉核对：

- `notes/reports/2026-07-23-current-development-coverage-review.md`
- 报告快照 `fe2cae8ae63a9ad818ef3b607b2c806c5757d88d` 中的 Adobe `photoshopcore.md`
- 当前 `src/shared/photoshop-api/core-protocol.ts`
- 当前 WebView Core 类型与代理
- 当前 UXP Core Host Adapter
- Core contract 与 WebView CDP 测试定义
- Adobe 官方 Photoshop Core 参考页

Adobe 基线包含 1 个属性 `apiVersion` 和 30 个函数，共 31 个成员。当前桥接协议暴露 18 个成员，没有额外的非 Adobe Core 成员：

```text
DOCUMENTED=31
IMPLEMENTED=18
MISSING=13
EXTRA=0
```

精确覆盖率为：

```text
18 / 31 = 58.1%
```

当前实现的 18 项质量和四层一致性良好，但整个模块仍被有意限定为 query-only 子集，不能称为完整 Photoshop Core。

## 对原报告的审查

### 仍然成立的结论

原报告以下结论仍然成立：

- Photoshop Core 覆盖为 18/31。
- 缺失 13 个 Core 成员。
- callback、listener 和可重入 modal callback 是主要架构缺口。
- 当前 Core 查询切片通过静态、类型、构建和契约验证，不代表完整 Core API 已闭合。
- `Document.suspendHistory`、Action listener 和 Core callback/listener 具有共同的双向 callback/event 协议前置条件。

从报告快照 `fe2cae8…` 到当前 HEAD，以下 Core 文件没有变化：

- `src/shared/photoshop-api/core-protocol.ts`
- `src/webview/photoshop-api/modules/core/*`
- `src/uxp/photoshop-api/modules/core/*`
- `test/contract/photoshop-core.test.mjs`

因此，Core 的 18/31 结论不是历史残留，而是当前状态。

### 已经过期的非 Core 结论

原报告把 `PSLayerKind` 运行时常量列为缺失。当前分支已经：

- 从 `Layer.d.ts` 生成 `PSLayerKind`
- 将它加入 `PhotoshopConstants`
- 通过 WebView 与 contract parity 测试

因此，原报告的 Shared enum 总数和 `PSLayerKind` 缺口已经过期，但这不影响 Core 的分子、分母或 13 项缺失清单。

## 当前实现边界

### 协议层

`src/shared/photoshop-api/core-protocol.ts` 只登记以下 18 个方法：

1. `apiVersion`
2. `calculateDialogSize`
3. `convertColor`
4. `getActiveTool`
5. `getCPUInfo`
6. `getDisplayConfiguration`
7. `getGPUInfo`
8. `getLayerGroupContents`
9. `getLayerGroupContentsSync`
10. `getLayerTree`
11. `getLayerTreeSync`
12. `getMenuCommandState`
13. `getMenuCommandTitle`
14. `getPluginInfo`
15. `getUserIdleTime`
16. `historySuspended`
17. `isModal`
18. `translateUIString`

协议注释直接把该模块定义为 read-only Core bridge。

### WebView 类型与代理

`src/webview/photoshop-api/modules/core/types.ts` 的 `PhotoshopCore` interface 与协议的 18 项完全一致。

`src/webview/photoshop-api/modules/core/core.ts` 为每一项建立独立 RPC 映射。Native 名字包含 `Sync` 的 layer tree 方法，在 WebView 端仍然返回 Promise；这是跨 WebView 消息桥的合理语义适配，不应判为缺失。

### UXP Host Adapter

`src/uxp/photoshop-api/modules/core/host.ts` 明确声明：

```text
Dispatch non-mutating core calls; none of these operations enters executeAsModal.
```

Host Adapter 对参数和结果进行以下处理：

- 数字、整数、字符串、布尔值和对象校验
- `getActiveTool` 的 `classId`/`classID` 归一化
- `getMenuCommandState` 的 boolean/tuple 归一化
- `getMenuCommandTitle` 字符串归一化
- layer tree 列表和 `kind` 版本差异归一化
- 非法 options 在调用 Native Photoshop API 前拒绝

当前 Host Adapter 没有 mutation 分支，也没有 callback、listener 或资源清理上下文。

### 测试边界

`test/contract/photoshop-core.test.mjs` 明确把当前协议称为 complete non-mutating method set，并断言：

```js
isPhotoshopCoreMethodName("core.executeAsModal") === false
```

这说明测试验证的是当前限定子集，而不是 Adobe Core 完整性。

本轮实际执行：

| 验证 | 结果 |
| --- | --- |
| `pnpm build` | 通过 |
| `node --test test/contract/photoshop-core.test.mjs` | 4/4 通过 |
| 真实 Photoshop/UXP CDP | 未执行 |

当前 `core.test.ts` 定义了 public shape、utility queries、environment queries、document queries 和 layer hierarchy 五组 CDP 用例，但本轮没有真实宿主证据。

## 13 项精确缺失清单

| 缺失成员 | Adobe 最低版本 | Shared 类型状态 | 当前替代能力 | 实现难度 | 优先判断 |
| --- | ---: | --- | --- | --- | --- |
| `addNotificationListener` | 23.3 | 已声明 | 无 | 高 | callback/event 基础设施 tracer slice |
| `removeNotificationListener` | 23.0 | Core interface 未声明 | 无 | 高 | 必须与 add 成对交付 |
| `executeAsModal` | 22.5 | 已声明 | Host 内部使用，WebView 不可调用 | 很高 | 架构级缺口 |
| `convertGlobalToLocal` | 26.0 | 未声明 | 无 | 低 | 优先补齐的简单查询 |
| `createTemporaryDocument` | 23.0 | 只有相关 options/result 类型 | 普通 DOM duplicate 不等价 | 中高 | 需要资源生命周期设计 |
| `deleteTemporaryDocument` | 23.0 | 只有相关 options 类型 | 无 | 中高 | 与 create 成对实现 |
| `endModalToolState` | 22.5 | 已声明 | 无直接等价 API | 中 | 真实宿主状态风险较高 |
| `performMenuCommand` | 22.5 | 已声明 | 可用 batchPlay 模拟部分命令，但不等价 | 中 | 返回形状需实机探测 |
| `redrawDocument` | 24.1 | 已声明 | `app.updateUI` 部分相似但不等价 | 低到中 | 文档级 redraw 应独立公开 |
| `setExecutionMode` | 23.2 | 已声明 | 无 | 低 | Developer Mode 专用 |
| `setUserIdleTime` | 23.3 | 已声明 | `getUserIdleTime` 只读已实现 | 低 | 应与 notification 一起交付 |
| `showAlert` | 22.5 | 已声明 | `photoshop.app.showAlert(message)` 已存在 | 低 | 能力基本具备，缺精确 Core 表面 |
| `suppressResizeGripper` | 23.1 | 已声明 | 无 | 低到中 | 需要 panel entrypoint 上下文 |

## 按缺口性质分类

### A. 双向 callback/event 协议缺口：3 项

#### `addNotificationListener`

Core notification 是 UXP Host 主动向 WebView 投递事件，不是现有 request/response RPC 可以表达的调用。

需要：

- listener/callback ID
- UXP 侧 listener registry
- Host→WebView event envelope
- WebView listener dispatch
- 事件顺序和错误隔离
- Bridge destroy 时自动注销
- 重复注册和重复删除语义
- 未处理事件的背压策略

#### `removeNotificationListener`

Adobe API 用原 listener 引用删除注册。跨桥后必须通过稳定 callback ID 保留同一身份，不能在每次调用时重新序列化函数。

该方法当前甚至不在 Shared `Core` interface 中，因此类型基线也需要补齐。

#### `executeAsModal`

当前 Host 已为独立 mutation 自动调用 Native `core.executeAsModal`，但这不等于公开 API 已覆盖。

WebView 用户目前无法：

- 把多次远程调用包进同一个 modal transaction
- 设置 `commandName`、`interactive`、`timeOut`
- 读取 `ExecutionContext.isCancelled`
- 注册 `onCancel`
- 调用 `reportProgress`
- 调用 `hostControl.suspendHistory`/`resumeHistory`
- 注册临时文档自动关闭

完整实现要求 Host 在 Native modal callback 内反向调用 WebView callback，WebView callback 又能对 Host 发起嵌套 RPC。这是可重入双向协议，而不是增加一个普通 method name。

### B. 临时资源生命周期缺口：2 项

#### `createTemporaryDocument`

Adobe API 创建不出现在 UI 中的临时副本文档。它与普通 `Document.duplicate` 不等价。

需要决定：

- 是否精确返回 `{documentID}`
- 是否封装为有 `dispose()` 的资源对象
- Host 是否跟踪所有创建的临时 document ID
- WebView 断连、超时、Bridge destroy 时是否自动删除
- 是否允许临时文档进入现有 `PsDocument` remote registry

按照项目既有资源边界，不能只返回裸 ID 而没有异常路径清理策略。

#### `deleteTemporaryDocument`

必须与 create 成对实现，并定义：

- 重复删除行为
- 非临时 document ID 的拒绝方式
- Native 删除失败的 `BridgeRemoteError` 映射
- Host 清理与用户显式清理之间的竞态处理

### C. 普通查询：1 项

#### `convertGlobalToLocal`

这是 13 项中最简单的缺口之一：

- 输入：panel `target` 和 `{x, y}`
- 输出：本地 `{x, y}`
- 不需要 modal
- 不需要 callback

但 Host 必须验证：

- `target` 是非空字符串
- `location.x/y` 是有限数字
- 宿主版本支持 Photoshop 26.0+
- Native 返回值是有限坐标

CDP 测试应使用 fixture manifest 中真实存在的 panel ID，并分别记录 Windows 像素和 macOS point 语义。

### D. Host UI/状态 mutation：7 项

#### `endModalToolState`

该方法提交或取消当前 modal tool 编辑状态。不能用普通用户文档做默认自动测试，应由 fixture 建立可控 modal tool 状态，或标记为显式实机场景。

不应未经验证地把它再次包进通用 `executeAsModal`，因为它本身是在结束另一个 modal tool 状态。

#### `performMenuCommand`

这是高价值缺口，但存在返回类型漂移：

- Adobe 参考页描述 `Promise<boolean>`
- 当前 Shared 类型描述 `PerformMenuCommandResult`，含 `available` 和 `userCancelled`

实现前需要在受支持 Photoshop 版本中探测真实返回值。Host 可考虑兼容 boolean 和 object，但公共返回形状必须先确定，不能无依据猜测。

测试必须使用 disposable document 和无破坏性的固定 command ID。

#### `redrawDocument`

该方法按 document ID 请求立即刷新并返回耗时。`app.updateUI()` 没有 document 定位和耗时返回，因此只能算部分替代，不能算覆盖。

建议作为独立 Host-authority mutation 实现，并验证 document ID 与返回秒数。

#### `setExecutionMode`

仅 Developer Mode 有效。公共接口应保留 Adobe 的 options，并把宿主不支持或未开启开发者模式映射为明确的远程错误。

CDP 测试必须在 `finally` 中恢复选项，避免影响后续测试。

#### `setUserIdleTime`

技术上是简单 number mutation，但没有 notification listener 时业务价值很低。建议与 Core notification 同一批交付，并在测试后恢复原 idle time。

#### `showAlert`

当前 `photoshop.app.showAlert(message)` 已经提供近似能力，因此：

- 精确 API parity：缺失
- 用户能力 parity：基本具备

可以在 UXP Host 复用现有 alert 校验和调用路径，但 WebView 必须保留 Core 的 `{message}` 参数形状或明确记录兼容简化。

自动化 CDP 不宜默认弹出阻塞式 alert，应使用 contract 测试和显式人工场景。

#### `suppressResizeGripper`

需要校验：

- `type`
- `target`
- `value`
- target 是否对应 fixture manifest entrypoint

CDP 测试必须恢复 resize gripper 状态，避免污染面板 UI。

## 当前协议为何无法支持 callback

`src/shared/protocol.ts` 目前只有：

- `bridge.call`
- `bridge.cancel`
- `bridge.success`
- `bridge.error`

WebView `RpcClient` 只接受 success/error，并用 `operationId` 解析 pending request。

UXP `RpcHost` 只接受 call/cancel，没有 Host 主动 invoke 或 event envelope。

因此完整 callback 基础设施至少需要表达以下语义，具体消息名应由 RFC 决定：

```text
WebView                  UXP Host
   | register callback      |
   |----------------------->|
   |                        |
   |   callback/event invoke|
   |<-----------------------|
   |                        |
   | callback result/error  |
   |----------------------->|
   |                        |
   | unregister / destroy   |
   |----------------------->|
```

对 `executeAsModal`，还必须支持 callback invoke 尚未结束时 WebView 对 Host 发起新的 bridge calls。

## Shared 类型漂移

Adobe 31 项基线与 Shared `Core` interface 并不相同。

Shared interface 缺少以下 9 个 Adobe 文档成员：

- `convertGlobalToLocal`
- `createTemporaryDocument`
- `deleteTemporaryDocument`
- `removeNotificationListener`
- `getLayerGroupContents`
- `getLayerGroupContentsSync`
- `getLayerTree`
- `getLayerTreeSync`
- `historySuspended`

其中后五项已由 bridge 自有类型补偿并实现；前四项仍同时缺失于 Shared 和运行时。

这意味着不能仅以 `src/shared/types/photoshop/internal/dom/CoreModules.d.ts` 计算 Core 完整性。后续门禁应增加一个显式维护的 Adobe Core 基线清单，或者从固定的参考文档/声明来源生成 parity 测试。

## 已实现 18 项的兼容折中

当前 18 项没有发现阻断性实现错误，但存在以下有意兼容：

| 项目 | Native/文档差异 | 当前处理 |
| --- | --- | --- |
| `getLayer*Sync` | Native 同步 | WebView 仍返回 Promise，符合消息桥边界 |
| `getMenuCommandState` | boolean 与 `[boolean]` 漂移 | Host 归一化为 boolean |
| `getMenuCommandTitle` | Shared 返回 `any` | Host 归一化为 string |
| `getActiveTool` | `classId` / `classID` | 公共类型采用 `classID` |
| layer tree `kind` | string / numeric `layerKind` | 公共类型允许 string 或 number |
| `getDisplayConfiguration` | options 默认值差异 | WebView 允许省略，Host 传 `{}` |

这些折中是合理的桥接归一化，不应从 18 项覆盖中扣除。

## 覆盖率的不同口径

### 精确 API parity

```text
18 / 31 = 58.1%
```

这是本报告采用的主口径。

### 能力近似口径

如果把 `app.showAlert` 视为 `core.showAlert` 的等价能力：

```text
19 / 31 = 61.3%
```

不建议把 Host 内部 `executeAsModal` 算作公共 Core 覆盖，因为用户无法创建任意 modal transaction，也无法使用 ExecutionContext。

### 完成全部非 callback 项后

13 项缺口中有 10 项不要求双向 callback/event 协议。完成这些成员后可达到：

```text
28 / 31 = 90.3%
```

最后 3 项为 notification add/remove 和 `executeAsModal`。

## 推荐实施路线

### Phase 1：Core 基线与类型门禁

1. 固化 31 项 Adobe Core 基线。
2. 为当前 18 项和剩余 13 项增加静态 parity 断言。
3. 补齐 WebView/Host 所需 options/result 类型。
4. 明确四个 Shared 缺失方法是更新镜像还是由 bridge-owned 类型承接。
5. 对 Photoshop 最低版本增加运行时能力判断或稳定的远程错误。

### Phase 2：低风险非 callback 批次

优先实现：

- `convertGlobalToLocal`
- `redrawDocument`
- `showAlert`
- `suppressResizeGripper`

目标是先验证 Core Adapter 从 query-only 扩展到受控 Host UI 调用的边界。

### Phase 3：临时文档资源批次

成对实现：

- `createTemporaryDocument`
- `deleteTemporaryDocument`

先决定资源表示和异常清理策略，再写协议。

### Phase 4：剩余 Host 状态 mutation

实现：

- `performMenuCommand`
- `endModalToolState`
- `setExecutionMode`
- `setUserIdleTime`

其中 `performMenuCommand` 必须先做真实宿主返回形状探测。

### Phase 5：callback/event RFC 与 tracer slice

RFC 至少覆盖：

- callback ID 和 listener ID
- UXP→WebView invoke/event
- callback success/error
- 注册、注销和销毁清理
- 事件顺序、并发与背压
- callback 超时
- 用户取消和 bridge cancel
- `BridgeRemoteError` 双向映射
- modal callback 中的嵌套 RPC

用 `core.addNotificationListener('UI', ['userIdle'], ...)` 作为第一条 tracer slice，再扩展到：

- `core.removeNotificationListener`
- Action add/remove listener
- `Document.suspendHistory`
- `core.executeAsModal`

### Phase 6：完整 `executeAsModal`

必须覆盖：

- `commandName`
- `interactive`
- `timeOut`
- callback 返回值
- callback 异常
- `isCancelled`
- `onCancel`
- `reportProgress`
- `hostControl.suspendHistory`
- `hostControl.resumeHistory`
- auto-close document 注册/注销

不能只实现一个忽略 ExecutionContext 的简化 callback 并宣称 API 闭合。

## 测试建议

### Static

- Adobe Core 31 项基线与 public namespace 差集为零。
- WebView method names 与 shared protocol 一致。
- UXP dispatch cases 与 shared protocol 一致。
- callback/event envelope 类型只能位于 shared/runtime-neutral 层。

### Contract

- 每个新增方法映射到独立 RPC name。
- 参数在 Native 调用前校验。
- 版本不支持时返回稳定 `BridgeRemoteError`。
- notification 注册/注销保持 callback identity。
- Bridge destroy 清理全部 listener 和临时文档。
- callback 异常保留 remote metadata 和 operation ID。
- modal callback 支持嵌套调用和超时。

### UXP/CDP

- `convertGlobalToLocal` 使用 fixture panel ID。
- `redrawDocument` 使用 disposable document。
- `performMenuCommand` 使用安全 command 和 disposable document。
- temporary document 在 `finally` 删除，并验证 UI 中不可见。
- idle time 和 execution mode 在 `finally` 恢复。
- resize gripper 状态在 `finally` 恢复。
- alert 不进入默认无人值守套件。
- listener 用例必须显式 unregister，并验证 Bridge destroy cleanup。
- `executeAsModal` 覆盖进度、取消、错误和 history suspension。

## 风险排序

| 风险 | 等级 | 原因 |
| --- | --- | --- |
| callback/event 协议缺失 | Critical | 同时阻塞 Core、Action 和 Document callback API |
| `executeAsModal` 可重入设计 | Critical | 错误实现可能死锁、超时或破坏 modal 状态 |
| 临时文档泄漏 | High | 异常、断连或超时可能遗留 Host 资源 |
| menu command 返回形状漂移 | High | 官方文档与 Shared 类型不一致 |
| 真实 UXP/CDP 未执行 | High | mock 无法证明 Native 返回形状和 modal 要求 |
| Host 版本差异 | Medium | Core 方法最低版本从 22.5 到 26.0 不等 |
| UI 状态污染 | Medium | idle、resize gripper、tool modal 和 execution mode 需恢复 |

## 最终判断

Photoshop Core 当前状态应描述为：

> 18 项查询型 Core API 已形成完整的协议、WebView、Host 和 contract 闭环；Adobe 31 项公开表面仍缺 13 项，其中 10 项可作为普通 Host-authority RPC 独立推进，3 项需要新的双向 callback/event 基础设施。

因此：

- 不能称为完整 Photoshop Core。
- 当前 18 项不是低质量或半实现，而是边界明确的稳定子集。
- 原报告的 Core major finding 仍然成立。
- 原报告不应继续把 `PSLayerKind` 计为当前缺口。
- 非 callback 长尾不应等待 callback 协议完成后才开始。
- callback RFC 应尽早启动，因为它是 Core、Action 和 Document 剩余复杂缺口的共同基础。

## 参考

- Adobe Photoshop Core reference: <https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/photoshopcore>
- Adobe Event Codes: <https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/eventcodes>
- `notes/reports/2026-07-23-current-development-coverage-review.md`
- `src/shared/photoshop-api/core-protocol.ts`
- `src/shared/protocol.ts`
- `src/shared/types/photoshop/internal/dom/CoreModules.d.ts`
- `src/webview/photoshop-api/modules/core/types.ts`
- `src/webview/photoshop-api/modules/core/core.ts`
- `src/webview/rpc-client.ts`
- `src/uxp/photoshop-api/modules/core/host.ts`
- `src/uxp/rpc-host.ts`
- `test/contract/photoshop-core.test.mjs`
- `src/webview/photoshop-api/modules/core/core.test.ts`

## 实施结果（2026-07-28）

本报告识别的 13 项 Photoshop Core 缺口已经全部实现，精确 API parity 从
`18/31` 提升为 `31/31`。实现同时完成了报告指出的共用前置能力：

- Shared 层固定 Adobe 31 成员基线，并将 28 个普通成员与 3 个 callback 成员分开校验；
- WebView/UXP 双向 callback envelope、稳定 callback ID、结构化远程错误与 callback 超时；
- Core 与 Action notification 的幂等注册、FIFO、256 项背压上限、移除/重加串行化；
- 单一 public modal 队列、modal session 嵌套 RPC、完整 ExecutionContext 与 transport-safe 泛型结果；
- `Document.suspendHistory` 共用 modal/callback 基础设施；
- 临时文档按 bridge session 隔离，支持显式删除、30 分钟超时和 teardown 原生清理；
- WebView 入站 origin/source 校验，以及不可预测的加密随机 operation/callback ID；
- `executeAsModal.descriptor` 与新增公共类型从 `uxp-webview-bridge/webview` 导出。

独立代码评审发现的消息伪造、临时文档 owner 复用、listener remove/add 竞态和 teardown
等待问题均已修复并加入回归测试。最终验证结果：

```text
pnpm test:static  PASS
pnpm typecheck    PASS
pnpm build        PASS
contract tests    217/217 PASS
```

真实 Photoshop/UXP CDP 仍未在本次无宿主环境中执行；涉及可见 UI、真实 menu command、
panel 坐标与原生 modal 状态的宿主行为仍应按本报告的 CDP 建议在 fixture 中验证。
