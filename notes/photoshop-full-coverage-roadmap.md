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

## 1. 当前进度（2026-07-08 复核，已更新）

> **重大更新**：本次复核发现 roadmap 原先列为"待办/欠账"的 **批次 0.5 地基、线 B、线 C 均已完整落地**。
> 三块地基欠账已还清（原 §2），batchPlay 与 imaging 已实现并有 CDP 测试。
> **唯一真正未推进的是线 A 的 DOM 类扩展**（仍是 3/37）。详情见下表与 §2。

### 已完整落地
- 通用底座：`src/webview/uxp-api/remote/`（RemoteClass、reference、identity-cache）+ `src/uxp/uxp-api/remote/handle-registry`。
- shared 协议 + 常量（枚举表：SaveOptions/AnchorPosition/BlendMode/LayerKind/ElementPlacement/FlipAxis 等）。
- **PsDocument**（webview/host 对称）：只读/可写标量 + layers/activeLayers/artboards/backgroundLayer + 21 方法、batchGet/Set、dispose。
- **PsLayer**（webview/host 对称）：只读 + 可写标量 + bounds/boundsNoEffects 值对象 + document/parent/linkedLayers 引用 + 11 方法、batchGet/Set、dispose。
- **Layers** 集合（快照 + getByName + add）、**ImagingBounds** 值对象。
- executeAsModal 边界：按描述符 `mutating` 路由；batchSet 多属性合入单 modal scope。
- **✅ 批次 0.5 三块地基（原 §2 欠账，已全部完成，声明式模型）**：
  - **值对象注册表**：`src/shared/photoshop-api/value-objects.ts`（`registerValueObject` / `serializeValue` / `decodeValue`，按 `valueKind` 查表）。ImagingBounds + PsImageDataMetadata 已注册。
  - **快照集合工厂**：`registry.ts` 的 `createSnapshotCollection`（通用 Array 子类，`getByName`/`add` 作为按成员类型声明的可选能力，成员走身份缓存解析）。
  - **类型注册中心**：`createPhotoshopTypeRegistry`（name→{factory, identityCache}，`decodeContext` 惰性查找解循环引用）。Document/Layer/Layers 已重构到该模型，描述符改为纯声明式 `refType`/`valueKind`/`collectionOf`（原 §7 待办已消除）。
- **✅ 线 B — batchPlay（已实现）**：`photoshop.action.batchPlay` 纯 RPC 直通；re-export Adobe `ActionDescriptor`/`BatchPlayCommandOptions`；host 默认 executeAsModal 全包；有 `photoshop.batchplay-roundtrip` CDP 测试。
- **✅ 线 C — imaging + 通用二进制层（已实现）**：
  - 通用二进制层已抽出 `src/shared/uxp-api/binary-transport.ts`（`BinaryTransportData` + `bytesToTransport`/`transportToBytes` + 内联阈值）。
  - imaging 命名空间完整：getPixels/getLayerMask/getSelection、putPixels/putLayerMask/putSelection、createImageDataFromBuffer、encodeImageData。
  - `PsImageData` 为资源句柄类（handle registry + TTL + 显式 dispose）；元数据作值对象随行，getData 走二进制信封。
- **ADR 文档**：0001~0011 齐全（新增 0009 声明式注册表 / 0010 batchPlay 直通 / 0011 二进制传输 + imaging handle）。

### DOM 类覆盖度（线 A —— 唯一未推进项）
- ps-reference `classes/` 约 37 个类，**当前仍仅覆盖 3 个**：Document / Layer / Layers。
- 未覆盖（长尾）：Channel(s)、Guide(s)、HistoryState(s)、LayerComp(s)、PathItem(s) / PathPoint(s) / SubPath*、Selection、SolidColor、TextItem / TextFont(s) / CharacterStyle / ParagraphStyle、ColorSampler(s)、CountItem(s)、Preferences、Action / ActionSet、Documents、WarpStyle、Tool 等。

### 遗留细节（未完全达成的目标）
- §4 步骤 1 目标"fs/crypto/fetch **全部**复用通用二进制层"：**fs、crypto 已复用**；**fetch 尚未复用**（`src/*/uxp-api/modules/fetch` 未引用 binary-transport）。若 fetch 有二进制传输需求，作为独立收尾项处理。

---

## 2. 三块地基欠账（批次 0.5）—— ✅ 已全部完成

> **状态更新（2026-07-08）**：本节所述三块欠账**已全部还清**，Document/Layer/Layers 已重构到声明式 + 中心查找模型。
> 下列小节保留作设计记录（说明"为什么这么做"），落地位置见 §1「已完整落地」。全量铺开新 DOM 类时按此模型登记即可，无需再返工。

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

| 批次 | 状态 | 内容 | 说明 / 依赖 |
|---|---|---|---|
| **0.5 — 地基** | ✅ 完成 | 值对象注册表 + 快照集合工厂 + 类型注册中心（含 Document/Layer/Layers 重构到新模型） | 三块一起做；全量前置，最高优先 |
| **1 — Channels 验证** | ⬜ 未开始 | Channels / Channel（成员 RemoteObject）+ histogram 值对象 + `Channel.document` 跨类引用 | 三块地基的**最小完整试金石**，风险最低。**下一步从这里开始** |
| **2 — 批量同构集合** | ⬜ 未开始 | Guides/Guide、LayerComps/LayerComp、HistoryStates/HistoryState、Documents、ColorSamplers/ColorSampler、CountItems/CountItem、TextFonts/TextFont、ActionSets/Action 等 | 验证通过后按工厂**批量快速复制** |
| **3 — 值对象簇** | ⬜ 未开始 | SolidColor、TextFont、UnitValue、CharacterStyle、ParagraphStyle、WarpStyle 等（作为 TextItem 前置） | 独立铺开值对象，供后续类引用 |
| **4 — TextItem 家族** | ⬜ 未开始 | TextItem + `Layer.textItem` 跨类引用（依赖 SolidColor/TextFont/字符段落样式） | 依赖链最长，放后面 |
| **5 — 路径簇** | ⬜ 未开始 | PathItem(s) / PathPoint(s) / SubPathItem(s) / SubPathInfo / PathPointInfo（嵌套几何 + 值对象集合） | 复合集合形态验证 |
| **6 — Selection** | ⬜ 未开始 | Selection（几何方法 + Bounds/矩形值对象） | 常用但值对象形态多 |
| **7 — Preferences / Tool / 长尾** | ⬜ 未开始 | Preferences、Tool、WarpStyle 等剩余类 | 收尾 |
| **B — batchPlay** | ✅ 完成 | 见 §3；模型独立 | 已实现 + CDP 测试 |
| **C — imaging** | ✅ 完成（fetch 复用待收尾） | 见 §4；通用二进制层 + PhotoshopImageData | 通用二进制层已抽出，fs/crypto 已复用；fetch 复用未做 |

---

## 6. 每批次交付门槛（沿用 spec）

- 每批：`pnpm typecheck` + `pnpm test:static`（边界/布局/import 规则）。
- 交付前：`pnpm build`。
- 涉及共址 CDP case：`pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp`。
- 新增枚举：按需增量誊写 + 静态测试断言与 `@shared-types/photoshop` 类型兼容。
- 新增值对象/集合/类型：在对应注册中心登记 + 静态测试锁 `keyof` 一致性。

---

## 7. 命名/来源分歧

- ✅ **已消除**：spec §1 的 `refType`/`valueKind` 声明式 vs 曾经的 `remoteKey` + `decode` 函数 —— 批次 0.5 重构已统一回声明式（描述符现用 `refType`/`valueKind`/`collectionOf` 字符串 + 中心表惰性查找）。
- ⬜ **仍待厘清**：spec §1 写值对象为 `Bounds`，实现为 `ImagingBounds` —— 统一命名与文档来源（Adobe 有 `bounds.md` 值对象 与 Layer `bounds`/`boundsNoEffects` 两处，需对齐语义）。铺开 Selection / 路径簇时会再引入矩形/边界类值对象，届时一并对齐。

---

## 8. 下一步规划（2026-07-08）

地基 + B + C 已完成，路线收敛为**单线推进：线 A DOM 类扩展**。

1. **批次 1（立即）—— Channels 验证** → **详见 `docs/rfcs/0011-photoshop-channels-and-solidcolor.md`**：用已完成的三块地基跑通第一个新类簇（Channels/Channel + histogram + `Channel.parent → Document` 跨类引用）。**SolidColor 从批次 3 提前到本批**（因 `Channel.color` 依赖它，2026-07-08 grilling 决策），一并验证值对象注册表里最硬的一块。跑通即证明"加一类 = 声明 + 登记，地基零改动"，风险最低。
2. **批次 2 —— 批量同构集合**：批次 1 验证通过后，按工厂批量复制 Guides/LayerComps/HistoryStates/Documents 等结构相同的集合类。
3. **批次 3~6 —— 值对象簇 → TextItem → 路径簇 → Selection**：按依赖顺序推进（值对象先于依赖它们的 TextItem；路径簇验证复合集合形态）。
4. **批次 7 + 收尾**：Preferences/Tool 长尾；补 fetch 对通用二进制层的复用（§1 遗留细节）。

> 每批次仍走 §6 交付门槛（typecheck + test:static + build，涉及 CDP case 另跑 uxp 测试）。
