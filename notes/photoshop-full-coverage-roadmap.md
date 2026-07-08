# Photoshop 模块 —— 全量对齐路线图

本文档是 grilling 会话（对齐目标从"够用子集"拔高为"**全量对齐 Adobe ps-reference**"）后确定的规划。
与 `photoshop-module-spec.md`（技术规范总纲）并列：spec 定"怎么做单个类"，本文档定"全量覆盖的范围、地基欠账、批次顺序"。

参考文档：`uxp-document/ps-reference/`（Adobe 官方 UXP Photoshop 参考）。

---

## 0. 目标与范围（已确认）

- **目标**：全量对齐 Adobe ps-reference，不做"够用子集"。
- **范围三条独立工程线**（三者模型不同，不能共用同一套建模）：
  - **线 A — DOM 类**：`ps-reference/classes/` 下的全部 DOM 类，走 RemoteClass 模型。
  - **线 B — batchPlay**：`require("photoshop").action.batchPlay`，纯 RPC 直通。
  - **线 C — imaging**：`require("photoshop").imaging`，二进制像素传输。

---

## 1. 当前进度（已核实）

### 已完整落地
- 通用底座：`src/webview/uxp-api/remote/`（RemoteClass、reference、identity-cache）+ `src/uxp/uxp-api/remote/handle-registry`。
- shared 协议 + 常量（7 张枚举表：SaveOptions/AnchorPosition/BlendMode/LayerKind/ElementPlacement/FlipAxis 等）。
- **PsDocument**（webview/host 对称）：15 属性、21 方法、batchGet/Set、dispose。
- **PsLayer**（webview/host 对称）：21 属性、11 方法、batchGet/Set、dispose。
- **Layers** 集合（快照 + getByName + add）、**ImagingBounds** 值对象。
- executeAsModal 边界：按描述符 `mutating` 路由；batchSet 多属性合入单 modal scope。

### DOM 类覆盖度
- ps-reference `classes/` 约 37 个类，**当前仅覆盖 3 个**：Document / Layer / Layers。
- 未覆盖（长尾）：Channel(s)、Guide(s)、HistoryState(s)、LayerComp(s)、PathItem(s) / PathPoint(s) / SubPath*、Selection、SolidColor、TextItem / TextFont(s) / CharacterStyle / ParagraphStyle、ColorSampler(s)、CountItem(s)、Preferences、Action / ActionSet、Documents、WarpStyle、Tool 等。

---

## 2. 三块地基欠账（全量前必须先补 —— "批次 0.5"）

现状是"只为 Document/Layer/Layers 硬编码了一次"，全量铺开前必须通用化，否则每加一类都返工。
三者是同一次重构的三个面（围绕"**声明式类型 + 中心查找**"），一起做。

### 2.1 值对象注册表（Value Object Registry）
- **问题**：目前只有 `ImagingBounds` 一个值对象，靠 `bounds.ts` 手写 decoder + host 手写 `serializeImagingBounds` + context 手动持有字段。全量会引入一批值对象（SolidColor、UnitValue、PathPointInfo、SubPathInfo、histogram 数组…），散落手写会爆炸。
- **方案**：shared 侧每个值对象声明一次 `{ valueKind, fields }`（或自定义 serialize/deserialize 对），两侧共享；host 按 `valueKind` 统一序列化；webview 的 `decode` 按 `valueKind` 从注册表查。
- **收益**：加值对象 = 注册表一行 + 字段列表，而非改三文件三处。

### 2.2 快照集合工厂（Snapshot Collection Factory）
- **问题**：`layers.ts` 是手写 Array 子类 + host 硬编码 `serializeLayersSnapshot` / `LAYERS_SNAPSHOT_KIND`。全量有 10+ 个同构集合。
- **方案**：抽象出通用"快照集合"工厂 —— 给定 `{ 成员类型, ownerRef, 快照 RPC 方法名 }` 生成集合类；成员解析走身份缓存（RemoteObject）或值对象注册表（Value）；`getByName`/`getByIndex`/`add` 作为按类可选能力声明。host 侧统一 `serializeSnapshot(kind, memberType)`。
- **两种集合形态**：① 纯 RemoteObject 集合（同 Layers）；② 值对象/复合集合（PathPoints / SubPathItems 等，成员为值对象）。

### 2.3 类型注册中心（Type Registry）+ 声明式引用
- **问题**：webview 靠 `context.ts` 手动持有 `xxxDecoder` 并互相注入；host 靠 `LAYER_REF_PROPS` 手写 `Map<propName, remoteType>`。全量引用图是密集网且有循环引用（Layer.parent→Layer、Layer.document→Document…），注入式会导致工厂初始化顺序死锁 + N×N 接线。
- **方案**：所有 RemoteClass 子类和值对象注册到中心表（key = remote type 名）；属性/方法只声明**类型名字符串**（`refType: "TextItem"` / `valueKind: "SolidColor"`），解码时从中心表**惰性查找**（回到 spec §1 原本的声明式风格，取代 `decode: 函数` 注入）。host 侧引用 Map 从声明自动推导。
- **收益**：惰性查找天然解决循环引用；消除 N×N 手动接线。
- **代价**：需重构已跑通的 Document/Layer/Layers 的 context 与描述符声明（趁只有 3 类，成本最低）。

---

## 3. 线 B — batchPlay（已确认决策）

- **模型**：纯 RPC 直通，**不**走 RemoteClass、不需身份/地基。
- **引用编解码**：**不做**。batchPlay 纯 JSON 透传；descriptor 内部的 `_ref`/`_id` 是 Photoshop 原生 id 体系，与我们的 handle registry 是两套 id 空间，不强行映射。用户需自行 `await layer.id` 取原生 id 填入。
- **返回值**：原样透传，不反序列化。
- **类型**：直接 re-export Adobe 的 `ActionDescriptor` / `BatchPlayCommandOptions` 等类型（`@shared-types/photoshop`），不自誊。签名 `batchPlay(commands: ActionDescriptor[], options?: BatchPlayCommandOptions): Promise<ActionDescriptor[]>`。
- **executeAsModal**：默认全包（无法静态判断读/写，保守）；透传 Adobe 的 `modalBehavior` / `synchronousExecution` 等选项让高级用户自控。

---

## 4. 线 C — imaging（已确认决策）

- **前提发现**：`fs` 已有成熟二进制信封 `{ kind: "bytes", encoding: "array" | "base64", value }`（带内联阈值 `FS_INLINE_BYTES_LIMIT` + 完整 base64 编解码），但绑死在 fs 命名空间；crypto/fetch 也各自在传二进制。
- **两步方案**：
  1. **提升为 shared 通用二进制层**：抽 `src/shared/uxp-api/binary-transport.ts`（通用 `BinaryTransportData` + `bytesToTransport`/`transportToBytes` + 内联阈值），**fs/crypto/fetch/imaging 全部复用**，消除 3-4 份重复 base64。
     - 代价：blast radius 扩大到 photoshop 模块之外，需重构 fs/crypto/fetch 三个已跑通模块。
  2. **imaging 在通用二进制层之上建资源句柄**：`PhotoshopImageData` 作为**资源句柄类**（走 handle registry + TTL + 显式 `dispose`，符合 spec 资源句柄规则）；`getData()` 字节走通用二进制信封，元数据（width/height/components/colorProfile/colorSpace/componentSize）作为值对象随行。

---

## 5. 批次顺序（已确认大顺序）

> 大原则：**先补地基，再验证，再批量复制，最后攻依赖最重的簇**。技术依赖驱动，无业务插队诉求。

| 批次 | 内容 | 说明 / 依赖 |
|---|---|---|
| **0.5 — 地基** | 值对象注册表 + 快照集合工厂 + 类型注册中心（含 Document/Layer/Layers 重构到新模型） | 三块一起做；全量前置，最高优先 |
| **1 — Channels 验证** | Channels / Channel（成员 RemoteObject）+ histogram 值对象 + `Channel.document` 跨类引用 | 三块地基的**最小完整试金石**，风险最低 |
| **2 — 批量同构集合** | Guides/Guide、LayerComps/LayerComp、HistoryStates/HistoryState、Documents、ColorSamplers/ColorSampler、CountItems/CountItem、TextFonts/TextFont、ActionSets/Action 等 | 验证通过后按工厂**批量快速复制** |
| **3 — 值对象簇** | SolidColor、TextFont、UnitValue、CharacterStyle、ParagraphStyle、WarpStyle 等（作为 TextItem 前置） | 独立铺开值对象，供后续类引用 |
| **4 — TextItem 家族** | TextItem + `Layer.textItem` 跨类引用（依赖 SolidColor/TextFont/字符段落样式） | 依赖链最长，放后面 |
| **5 — 路径簇** | PathItem(s) / PathPoint(s) / SubPathItem(s) / SubPathInfo / PathPointInfo（嵌套几何 + 值对象集合） | 复合集合形态验证 |
| **6 — Selection** | Selection（几何方法 + Bounds/矩形值对象） | 常用但值对象形态多 |
| **7 — Preferences / Tool / 长尾** | Preferences、Tool、WarpStyle 等剩余类 | 收尾 |
| **B — batchPlay** | 见 §3；模型独立，可与 A 线并行 | 不依赖地基 |
| **C — imaging** | 见 §4；先通用二进制层，再 PhotoshopImageData | 通用二进制层可尽早启动（fs/crypto/fetch 去重收益独立） |

---

## 6. 每批次交付门槛（沿用 spec）

- 每批：`pnpm typecheck` + `pnpm test:static`（边界/布局/import 规则）。
- 交付前：`pnpm build`。
- 涉及共址 CDP case：`pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp`。
- 新增枚举：按需增量誊写 + 静态测试断言与 `@shared-types/photoshop` 类型兼容。
- 新增值对象/集合/类型：在对应注册中心登记 + 静态测试锁 `keyof` 一致性。

---

## 7. 待办：命名/来源分歧（重构时一并厘清）

- spec §1 写值对象为 `Bounds`，实现为 `ImagingBounds` —— 统一命名与文档来源（Adobe 有 `bounds.md` 值对象 与 Layer `bounds`/`boundsNoEffects` 两处，需对齐语义）。
- spec §1 的 `refType`/`valueKind` 声明式 vs 现实现的 `remoteKey` + `decode` 函数 —— 批次 0.5 重构统一回声明式。
