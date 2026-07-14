# Photoshop WebView API 开发覆盖审查

- 审查日期：2026-07-13
- 更新日期：2026-07-15
- 审查对象：`src/webview/photoshop-api`
- 参考文档：`uxp-document/ps-reference`
- 类型基线：`src/shared/types/photoshop`
- 原始 Git 基线：`5667f6ee306a6b5d63a0cf80a23ba558c0482080`
- 前一实现提交：`4d5199c`（RFC-0013 Document 完整表面批次）
- 本次实现：RFC-0014 Photoshop class surface completion（当前工作树）

## 结论

Photoshop WebView 桥已完成 RFC-0014 的 class surface completion 实现。此前完全缺失的 `CharacterStyle`、`ParagraphStyle`、`TextItem`、`TextWarpStyle` 已全部接入 RemoteObject、稳定 owner identity、queued write 和 modal mutation；Layer/Layers 的 group、text、排序、编辑及全部文档滤镜方法也已闭合。五个颜色模型和两个路径 builder 已提升为可独立构造、可验证、可传输的 WebView 本地值类。

当前 56 个 Shared class 中，55 个完整或基本完整，唯一部分项仍是 `Document.suspendHistory(callback)`；它需要通用 UXP→WebView 可重入回调协议，不属于普通 RemoteClass 方法扩张。当前总进度如下：

| 口径 | 已覆盖 | 分母 | 覆盖率 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 文档运行时公开表面（语义口径） | 649 | 665 | **97.6%** | WebView 能实际跨桥读取、调用或同步获得的公开成员 |
| 其中：48 个类/集合文档 | 506 | 507 | **99.8%** | 唯一缺口是 `Document.suspendHistory` |
| Shared 类型精确同名公开 | 118 | 271 | **43.5%** | TypeScript export graph 的机械交集 |
| Shared 类型语义公开 | 242 | 271 | **89.3%** | 允许 `Document -> PsDocument` 等稳定桥接重命名 |
| RFC-0014 三个目标簇成员 | 210 | 210 | **100%** | Layer/Layers 87/87、Path 44/44、Text 79/79 |

一句话判断：**类与集合表面已经基本闭合；下一阶段不再是补普通 class，而是设计 callback/event 协议，并继续补 Core 与 Action 的模块级长尾。**

2026-07-15 本轮更新的设计、实现和验证证据集中在 RFC-0014 与本报告中；RFC-0013 Document 批次对应前一提交 `4d5199c`。

## 统计口径

### 运行时公开表面

分母来自仓库内的参考文档快照，不用 Markdown 页面数量代替 API 数量：

- `classes/` 下 48 个非索引页面，统计顶层 Properties 和 Methods，共 507 个成员。
- `Document.saveAs` 按一个顶层属性计数，不把其 `bmp/gif/jpg/png/psb/psd` 子方法重复加权。
- 文档中的 deprecated 成员仍计入分母，例如 `Document.compositeChannels`。
- `modules/constants.md` 的 100 个枚举。
- `media/photoshopcore.md` 的 1 个属性与 30 个函数，共 31 个成员。
- `media/photoshopaction.md` 的 7 个函数。
- `media/imaging.md` 的 8 个 namespace API 与 12 个 `PhotoshopImageData` 成员。
- `batchGet`、`batchSet`、`dispose` 等桥自身扩展若不属于参考文档，不提高分子；`PhotoshopImageData.dispose` 是文档成员，正常计入。
- 构造器、教程页面、changelog、known issues，以及纯 options/object 字段不放进运行时成员分母；它们由类型符号口径补充衡量。

“语义覆盖”要求 WebView 公共 API 有可执行实现，并有对应 UXP dispatch/序列化路径；只有 `.d.ts` 不算运行时覆盖。

### Shared 类型表面

使用 TypeScript export graph 检查 `internal/all-types.d.ts`：

- 总导出符号：288。
- 具有类型含义的符号：271。
- 仅为运行时 value 的符号：17。

精确同名覆盖是 Shared 类型符号与 `src/webview/photoshop-api/modules/photoshop/index.ts` 的公共导出取交集。语义覆盖额外承认稳定映射，例如 `Selection -> PsSelection`、`PathItem -> PsPathItem`，以及常量 namespace 的同步值表。

`PathPointInfo` 和 `SubPathInfo` 现在是具备默认值、字段验证、`typename` 和传输投影的同步构造类；原有 `PathPointInfoInput`、`SubPathInfoInput` 继续作为兼容输入类型。`PreferencesNotifications` 已补入 export graph，当前分母为 271。

## 文档运行时覆盖明细

### 类与集合

| 类型簇 | 已覆盖 | 文档成员 | 覆盖率 | 现状 |
| --- | ---: | ---: | ---: | --- |
| Photoshop app + Documents | 23 | 23 | **100%** | App 18/18；Documents 具备 parent/typename/add/getByName/length |
| Document | 65 | 66 | **98.5%** | 除需要可重入 callback transport 的 `suspendHistory` 外全部覆盖 |
| Layer + Layers | 87 | 87 | **100%** | Layer 83/83；Layers 4/4，含组内集合、文本引用和全部滤镜方法 |
| Channel + Channels | 16 | 16 | **100%** | Channel 与集合表面闭合 |
| Selection | 26 | 26 | **100%** | 文档表面闭合 |
| HistoryState + HistoryStates | 9 | 9 | **100%** | 文档表面闭合 |
| Guide + Guides | 11 | 11 | **100%** | 文档表面闭合 |
| Path/geometry 全簇 | 44 | 44 | **100%** | RemoteObject/collection 35/35；PathPointInfo/SubPathInfo 构造值类 9/9 |
| Text 全簇 | 79 | 79 | **100%** | TextFont(s)、TextItem 与 Character/Paragraph/WarpStyle 全部闭合 |
| Preferences 全簇 | 68 | 68 | **100%** | 根对象与 12 个分类全部通过共享声明表驱动 |
| LayerComp + LayerComps | 22 | 22 | **100%** | 属性写入、方法、集合操作与稳定 `(docId,id)` 身份完整 |
| CountItem + CountItems | 21 | 21 | **100%** | 成员与 11 个组操作方法完整；实机空状态有 Adobe DOM 版本问题 |
| ColorSampler + ColorSamplers | 11 | 11 | **100%** | SampledColor/NoColor、move/remove 与集合操作完整 |
| Action + ActionSet | 16 | 16 | **100%** | 属性、父子引用及 delete/duplicate/play 已实现 |
| SolidColor | 8 | 8 | **100%** | 同步构造、活动色彩模型、`nearestWebColor`、`isEqual` 完整 |
| **合计** | **506** | **507** | **99.8%** | 仅 `Document.suspendHistory` 未覆盖 |

### 模块表面

| 模块 | 已覆盖 | 文档成员 | 覆盖率 | 主要缺口 |
| --- | ---: | ---: | ---: | --- |
| constants | 100 | 100 | **100%** | 文档枚举全部同步公开 |
| photoshop.core | 18 | 31 | 58.1% | event listeners、`executeAsModal`、临时文档、菜单/UI mutation 等 |
| photoshop.action | 5 | 7 | 71.4% | `addNotificationListener`、`removeNotificationListener` |
| photoshop.imaging | 8 | 8 | **100%** | namespace API 闭合 |
| PhotoshopImageData | 12 | 12 | **100% 语义覆盖** | 文档叫 `isChunky`，Shared/实现叫 `chunky`，精确名称为 11/12 |

把类/集合与模块合并后，语义覆盖为 **649/665（97.6%）**。若严格要求成员名称与 Markdown 完全一致，则因 `isChunky/chunky` 差异为 **648/665（97.4%）**。

## 已经完成得比较好的部分

1. **常量层已闭合。** 文档快照中的 100 个枚举均可通过 `photoshop.Enum` 和 `photoshop.constants.Enum` 同步读取，不需要 RPC。
2. **Imaging 已形成完整资源模型。** 8 个 API、二进制 transport、`PsImageData` handle、`getData` 和显式清理均已落地。
3. **App 与直接依赖簇已经闭合。** App 18/18、Preferences 68/68、Action/ActionSet 16/16、TextFont(s) 10/10、SolidColor 8/8。
4. **Document 主体与直接依赖已经闭合。** Document 65/66、Channels 16/16、ColorSampler(s) 11/11、CountItem(s) 21/21、LayerComp(s) 22/22。
5. **跨模块资源与桥基础设施已被实用验证。** `app.open` 与 `document.saveAs` 都可解析 UXP File 代理；type registry、value registry、snapshot collection、引用去重、联合引用、queued writes 和 modal dispatch 已被多个类型簇复用。
6. **Class 长尾已闭合。** Text 四类使用 owner-derived 稳定引用；Layer 83/83 与 Layers 4/4 完整；颜色模型和路径 builder 是无需 host handle 的本地构造值类。

## 还差什么

### 最大功能缺口

按未覆盖成员数量排序：

1. **Core 模块剩余 13/31。** 主要是 event listeners、`executeAsModal` callback、临时文档、菜单/UI mutation 等模块级能力。
2. **Action 模块剩余 2/7。** `addNotificationListener`、`removeNotificationListener` 与 Core listener 共用 callback/event 协议问题。
3. **Document 只差 1/66。** `suspendHistory(callback)` 需要单独设计通用、可重入、可传播取消与错误的 UXP→WebView callback transport，不能用序列化函数或脱离原生 modal scope 的伪兼容替代。
4. **严格命名尾项。** Imaging 文档的 `PhotoshopImageData.isChunky` 当前仍以 Shared/实现的 `chunky` 暴露。

Class 表已经没有完全缺失项；继续新增普通 RemoteClass 不再是最高收益方向。

### Shared 类型与参考文档存在漂移

这部分会直接影响“照类型开发”的可靠性：

- **已修复：** `@shared-types/photoshop/*` 现在指向 `src/shared/types/photoshop/*`。
- **已修复：** `PreferencesNotifications.d.ts` 已从 `internal/all-types.d.ts` 导出，类型分母从 270 调整为 271。
- 文档 constants 有 100 个枚举；Shared 声明有 102 个，多出 `RadialBlurMethod`、`RadialBlurQuality`。当前实现按 Shared 声明公开 102 个，对文档是超集。
- `Document` 文档有 66 个顶层成员，Shared `Document` 有 65 个，缺文档新增的 `zoom`。
- Shared `Layer` 比文档多 `selected`；当前实现也暴露它，但它不提高文档覆盖率。
- Shared `Core` 只有 22 个成员，而参考文档有 31 个；当前实现已主动覆盖部分文档新增能力，所以不能只用 Shared 类型决定开发范围。
- Shared `ActionModule` 有 5 个成员，而文档有 7 个；当前实现的 `batchPlaySync`、`recordAction` 属于文档存在但 Shared interface 落后的能力。
- Imaging 文档使用 `PhotoshopImageData.isChunky`，Shared 与 WebView 使用 `chunky`。需要明确选择兼容别名还是固定以真实宿主/声明为准。

因此，**Shared 类型是重要基线，但不是唯一真相**。已修复的入口问题不再阻塞开发；其余批次仍应同时核验 Markdown、Shared declaration 和真实 Photoshop 宿主。

## Shared 类型到当前实现的完整对应表

下面按 `internal/all-types.d.ts` 的真实 export graph 展开。状态含义：

- ✅：已经有完整或基本完整的公开对应。
- ⚠️：存在公开对应，但只有子集、值视图、内联类型或桥接改名。
- ❌：当前 WebView Photoshop 公共 API 没有对应。
- “同名”只说明公共符号名称一致；运行时完整度仍以文档成员表为准。

### Class：56 个

| Shared class | 当前 WebView 对应 | 状态 | 仍缺少什么 |
| --- | --- | --- | --- |
| `Action` | `Action` | ✅ 同名完整 | 文档成员 8/8；父级引用与 delete/duplicate/play 已实现 |
| `ActionSet` | `ActionSet` | ✅ 同名完整 | 文档成员 8/8；actions 快照与操作已实现 |
| `CMYKColor` | `CMYKColor` | ✅ 同名完整 | 同步构造、默认值、范围验证、`typename` 与传输投影完整；`CmykColorView` 保留兼容 |
| `Channel` | `PsChannel` | ✅ 改名完整 | 文档成员 10/10 |
| `Channels` | `Channels` | ✅ 同名完整 | 文档成员 6/6 |
| `CharacterStyle` | `CharacterStyle` | ✅ 同名完整 | 33 个属性与 `reset`；queued write、owner identity 与 modal mutation 完整 |
| `ColorSampler` | `PsColorSampler` | ✅ 改名完整 | 文档成员 7/7；采样颜色支持 `SolidColor | NoColor` |
| `ColorSamplers` | `ColorSamplers` | ✅ 同名完整 | 文档成员 4/4 |
| `CountItem` | `PsCountItem` | ✅ 改名完整 | 文档成员 7/7 |
| `CountItems` | `CountItems` | ✅ 同名完整 | 文档成员 14/14；包含全部组操作方法 |
| `Document` | `PsDocument` | ⚠️ 改名部分 | 文档成员 65/66，仅缺 `suspendHistory` callback transport |
| `Documents` | `Documents` | ✅ 同名完整 | 文档成员 5/5；快照成员保持 Document 身份 |
| `GrayColor` | `GrayColor` | ✅ 同名完整 | 同步构造、默认值、范围验证、`typename` 与传输投影完整 |
| `Guide` | `PsGuide` | ✅ 改名完整 | 文档成员 7/7 |
| `Guides` | `Guides` | ✅ 同名完整 | 文档成员 4/4 |
| `HSBColor` | `HSBColor` | ✅ 同名完整 | 同步构造、默认值、范围验证、`typename` 与传输投影完整 |
| `HistoryState` | `PsHistoryState` | ✅ 改名完整 | 文档成员 6/6 |
| `HistoryStates` | `HistoryStates` | ✅ 同名完整 | 文档成员 3/3 |
| `LabColor` | `LabColor` | ✅ 同名完整 | 同步构造、默认值、范围验证、`typename` 与传输投影完整 |
| `Layer` | `PsLayer` | ✅ 改名完整 | 文档成员 83/83；含 text/group/front-back/copy-cut/skew 与全部 `apply*` 方法 |
| `LayerComp` | `PsLayerComp` | ✅ 改名完整 | 文档成员 16/16；写入遵守 queued/modal 语义 |
| `LayerComps` | `LayerComps` | ✅ 同名完整 | 文档成员 6/6 |
| `Layers` | `Layers` | ✅ 同名完整 | `typename`、Document/group owner、快照、getByName/add 完整 |
| `NoColor` | `PsNoColor` | ✅ 改名完整 | 作为 `SampledColor` 联合值的无颜色分支 |
| `ParagraphStyle` | `ParagraphStyle` | ✅ 同名完整 | 14 个属性与 `reset`；queued write、owner identity 与 modal mutation 完整 |
| `PathItem` | `PsPathItem` | ✅ 改名完整 | 文档成员 15/15 |
| `PathItems` | `PathItems` | ✅ 同名完整 | 文档成员 5/5 |
| `PathPoint` | `PsPathPoint` | ✅ 改名完整 | 文档成员 6/6 |
| `PathPointInfo` | `PathPointInfo` | ✅ 同名完整 | 可构造值类 5/5；保留 `PathPointInfoInput` 兼容输入 |
| `PathPoints` | `PathPoints` | ✅ 同名完整 | 文档成员 2/2 |
| `Photoshop` | `Photoshop` / `PhotoshopApp` | ✅ 同名及兼容别名 | 文档成员 18/18；稳定 App singleton RemoteObject |
| `Preferences` | `Preferences` | ✅ 同名完整 | 根对象、typename 与 12 个分类引用完整 |
| `PreferencesBase` | `PreferencesBase` | ✅ 同名完整 | 统一 RemoteClass 基础语义 |
| `PreferencesCursors` | `PreferencesCursors` | ✅ 同名完整 | 全部属性 |
| `PreferencesFileHandling` | `PreferencesFileHandling` | ✅ 同名完整 | 全部属性 |
| `PreferencesGeneral` | `PreferencesGeneral` | ✅ 同名完整 | 全部属性 |
| `PreferencesGuidesGridsAndSlices` | `PreferencesGuidesGridsAndSlices` | ✅ 同名完整 | 全部属性 |
| `PreferencesHistory` | `PreferencesHistory` | ✅ 同名完整 | 全部属性 |
| `PreferencesInterface` | `PreferencesInterface` | ✅ 同名完整 | 全部属性 |
| `PreferencesNotifications` | `PreferencesNotifications` | ✅ 同名完整 | 类型入口已修复；全部属性 |
| `PreferencesPerformance` | `PreferencesPerformance` | ✅ 同名完整 | 全部属性 |
| `PreferencesTools` | `PreferencesTools` | ✅ 同名完整 | 全部属性 |
| `PreferencesTransparencyAndGamut` | `PreferencesTransparencyAndGamut` | ✅ 同名完整 | 全部属性 |
| `PreferencesType` | `PreferencesType` | ✅ 同名完整 | 全部属性 |
| `PreferencesUnitsAndRulers` | `PreferencesUnitsAndRulers` | ✅ 同名完整 | 全部属性 |
| `RGBColor` | `RGBColor` | ✅ 同名完整 | 同步构造、hex 解析、范围验证、`typename` 与传输投影完整 |
| `Selection` | `PsSelection` | ✅ 改名完整 | 文档成员 26/26 |
| `SolidColor` | `SolidColor` / `PsSolidColor` | ✅ 同名及兼容类型 | 默认白色、活动模型传输、`nearestWebColor`、`isEqual` 完整 |
| `SubPathInfo` | `SubPathInfo` | ✅ 同名完整 | 可构造值类 4/4；保留 `SubPathInfoInput` 兼容输入 |
| `SubPathItem` | `PsSubPathItem` | ✅ 改名完整 | 文档成员 5/5 |
| `SubPathItems` | `SubPathItems` | ✅ 同名完整 | 文档成员 2/2 |
| `TextFont` | `TextFont` | ✅ 同名完整 | family/name/postScriptName/style/parent/typename 6/6 |
| `TextFonts` | `TextFonts` | ✅ 同名完整 | length/parent/typename/getByName 4/4 |
| `TextItem` | `TextItem` | ✅ 同名完整 | 10 个属性、4 个方法、style/parent 引用与稳定 Layer owner identity 完整 |
| `TextWarpStyle` | `TextWarpStyle` | ✅ 同名完整 | 5 个属性与 `reset`；queued write、owner identity 与 modal mutation 完整 |
| `Tool` | `Tool` | ✅ 同名完整 | `id` 可写、`typename` 只读 |

Class 结论：

| 状态 | 数量 | class |
| --- | ---: | --- |
| 完整或基本完整 | 55 | RFC-0014 闭合 5 个颜色类、Layer(s)、2 个路径 builder 与 4 个 Text 类 |
| 部分对应 | 1 | `Document` 仅缺 `suspendHistory(callback)` |
| **完全缺失** | **0** | — |

> `PreferencesNotifications` 已加入 `internal/all-types.d.ts`，因此当前 class 分母为 56；它与其他 Preferences 分类一起计入完整覆盖。

### Enum / 常量：104 个

当前常量实现由 `Constants.d.ts` 生成，可通过 `photoshop.<Enum>` 和 `photoshop.constants.<Enum>` 使用。104 个 enum 中 103 个已有语义对应，只有 `PSLayerKind` 缺失。

| Shared enum 分组 | 当前实现 | 状态 | 说明 |
| --- | --- | --- | --- |
| `AnchorPosition`、`AntiAlias`、`ApplyImageBlendMode`、`ApplyImageChannel`、`ApplyImageLayer`、`AutoKernType`、`BMPDepthType`、`Baseline`、`BitmapConversionType`、`BitmapHalfToneType`、`BitsPerChannelType`、`BlendMode` | 同名 namespace 常量表 | ✅ | A-B |
| `CalculationsBlendMode`、`CalculationsChannel`、`CalculationsLayer`、`CalculationsResult`、`ChangeMode`、`ChannelType`、`CharacterAlignment`、`ColorBlendMode`、`ColorModel`、`ColorPicker`、`ColorProfileType`、`CreateFields` | 同名 namespace 常量表 | ✅ | C |
| `DepthMapSource`、`DialogModes`、`Direction`、`DisplacementMapType`、`Dither`、`DocumentFill`、`DocumentMode`、`EditLogItemsType`、`ElementPlacement`、`EliminateFields` | 同名 namespace 常量表 | ✅ | D-E |
| `FlipAxis`、`FontSize`、`ForcedColors`、`GenerativeUpscaleModel`、`Geometry`、`GridLineStyle`、`GridSize`、`GuideLineStyle` | 同名 namespace 常量表 | ✅ | F-G |
| `Intent`、`InterpolationMethod`、`JPEGFormatOptions`、`Justification`、`KashidaWidthType`、`Kinsoku`、`LabelColors`、`Language`、`LayerKind`、`LensType` | 同名 namespace 常量表 | ✅ | I-L |
| `MatteColor`、`MaximizeCompatibility`、`MiddleEasternDigitsType`、`MiddleEasternTextDirection`、`Mojikumi`、`NewDocumentMode`、`NoiseDistribution`、`OffsetUndefinedAreas`、`OperatingSystem`、`Orientation`、`OtherCursors` | 同名 namespace 常量表 | ✅ | M-O |
| `PNGMethod`、`PaintingCursors`、`Palette`、`ParagraphFeatures`、`ParagraphLayout`、`PathKind`、`PointKind`、`PointType`、`PolarConversionType`、`PreserveShape` | 同名 namespace 常量表 | ✅ | P |
| `RadialBlurMethod`、`RadialBlurQuality`、`RasterizeType`、`ResampleMethod`、`RippleSize`、`RulerUnits` | 同名 namespace 常量表 | ✅ | 两个 RadialBlur enum 是 Shared 相对 Markdown 的超集 |
| `SampleSize`、`SaveLogItemsType`、`SaveMethod`、`SaveOptions`、`SavePreview`、`SelectionType`、`ShapeOperation`、`SmartBlurMode`、`SmartBlurQuality`、`SpherizeMode`、`StrikeThrough` | 同名 namespace 常量表 | ✅ | S |
| `TextCase`、`TextureType`、`ToolType`、`TrimType`、`TypeInterfaceFeatures`、`TypeUnits`、`UndefinedAreas`、`Underline`、`Units`、`WarpStyle`、`WaveType`、`ZigZagType` | 同名 namespace 常量表 | ✅ | T-Z |
| `ColorConversionModel` | `ColorConversionModel`，同时挂到 `photoshop` | ✅ 精确同名 | 位于 util color types，不在 `Constants.d.ts` |
| `PSLayerKind` | — | ❌ 缺失 | Shared `Layer.d.ts` 私有/兼容枚举；当前公开的是 `LayerKind` |

### Interface：92 个

#### 精确同名公开：67 个

| 功能簇 | Shared interface = 当前公共类型 | 状态/备注 |
| --- | --- | --- |
| Action | `ActionDescriptor`、`ActionReference`、`BatchPlayCommandOptions` | ✅ 同名；descriptor 为开放结构 |
| Unit | `AngleValue`、`CentimeterValue`、`DensityValue`、`DistanceValue`、`InchValue`、`MillimeterValue`、`PercentValue`、`PicaValue`、`PixelValue`、`PointValue`、`UnitValue` | ✅ 同名 |
| Color descriptor | `CMYKColorDescriptor`、`GrayscaleColorDescriptor`、`HSBColorDescriptor`、`LabColorDescriptor`、`RGB32ColorDescriptor`、`RGBColorDescriptor` | ✅ 同名 |
| Core result/options | `CPUInfo`、`DisplayConfiguration`、`DisplayConfigurationBounds`、`DisplayConfigurationOptions`、`DisplayConfigurationPhysical`、`DocumentCoreOptions`、`GPUInfo`、`GetActiveToolResult`、`GetPluginInfoResult`、`LayerTreeInfo`、`LayerTreeList`、`MenuCommandMenuIDOptions`、`MenuCommandOptions`、`OpenCLDeviceInfo`、`OpenGLDeviceInfo`、`Scheduling` | ✅ 同名，但 active-tool/layer-tree 有宿主版本漂移兼容 |
| Imaging | `CreateImageDataFromBufferOptions`、`EncodeImageDataOptions`、`GetDataOptions`、`GetLayerMaskOptions`、`GetLayerMaskResult`、`GetPixelsOptions`、`GetPixelsResult`、`GetSelectionOptions`、`GetSelectionResult`、`PutLayerMaskOptions`、`PutPixelsOptions`、`PutSelectionOptions` | ✅ 同名；内部 imageData 改为 `PsImageData` handle |
| Value bounds | `ImagingBounds` | ✅ 同名；WebView 使用六字段值对象 |
| App / Preferences | `DocumentCreateOptions`、`ColorPickerOption` | ✅ 同名；用于文档创建与 PreferencesGeneral |
| Document save | `BMPSaveOptions`、`GIFSaveOptions`、`JPEGSaveOptions`、`PNGSaveOptions`、`PhotoshopSaveOptions` | ✅ 同名；`Document.saveAs` 六个格式入口共用 UXP File transport |
| Document conversion | `BitmapConversionOptions`、`IndexedConversionOptions`、`CalculationsOptions`、`CalculationsSource` | ✅ 同名；常量字段使用生成的精确 value union |
| Apply Image | `ApplyImageOptions`、`ApplyImageSource` | ✅ 同名；Layer `applyImage` 参数表面与 host 解码完整 |
| Text | `HyphenationProperties`、`JustificationProperties` | ✅ 同名；用于 CharacterStyle/ParagraphStyle 的复合属性 |
| Layer comp | `LayerCompCreateOptions`、`LayerCompRecaptureOptions` | ✅ 同名；用于 add/recapture |
| Generative | `GenerativeUpscaleOptions` | ✅ 同名；运行时方法按宿主版本能力返回原生错误 |

#### 桥接改名：9 个

| Shared interface | 当前 WebView 对应 | 状态/差异 |
| --- | --- | --- |
| `ActionModule` | `PhotoshopActions` | ⚠️ 5/7 文档函数；事件 listener 缺失 |
| `Bounds` | `ImagingBounds` | ⚠️ 当前为六字段超集值对象 |
| `BoundsSize` | `ImagingBoundsSize` | ✅ 改名 |
| `Core` | `PhotoshopCore` | ⚠️ Shared 成员 13/22 同名覆盖；另有 5 个文档超前方法 |
| `ICMYKColor` | `CMYKColor` / `CmykColorView` | ✅ 由构造值类实现，旧值视图名保留兼容 |
| `Imaging` | `PhotoshopImaging` | ✅ 改名，8/8 API |
| `ImagingBounds2` | `ImagingRect` | ✅ 改名 |
| `PhotoshopImageData` | `PsImageData` | ✅ 改名；远程资源 handle，显式 dispose |
| `Size` | `ImagingSize` | ✅ 改名 |

#### 当前缺失：16 个

| 类型簇 | 缺失 interface | 被什么功能阻塞/使用 |
| --- | --- | --- |
| Layer create | `GroupLayerCreateOptions`、`LayerCreateOptionsBase`、`PixelLayerCreateOptions`、`TextLayerCreateOptions` | `DocumentCreateOptions` 与 app.createDocument 已实现；Layer 创建仍是安全子集 |
| Core/modal/history | `ExecuteAsModalOptions`、`ExecutionContext`、`GetLayerParentOptions`、`HistoryStateInfo`、`HistorySuspension`、`OnCancelCbArgument`、`PerformMenuCommandResult`、`ReportProgressOptions`、`ResumeHistorySuspensionOptions`、`SetExecutionModeOptions`、`SuppressResizeGripperOptions`、`SuspendHistoryContext` | mutating core、modal callback/event/history API 未实现 |

### Type alias：19 个

| Shared type alias | 当前 WebView 对应 | 状态 |
| --- | --- | --- |
| `ApplyImageChannelType` | `ApplyImageChannelType` | ✅ 精确同名；供 `Layer.applyImage` 使用 |
| `ApplyImageLayerType` | `ApplyImageLayerType` | ✅ 精确同名；供 `Layer.applyImage` 使用 |
| `CPUVendorKind` | `CPUInfo.vendor` 内联 union | ⚠️ 使用但未具名公开 |
| `CalculationsChannelType` | — | ❌ calculations 未实现 |
| `ColorDescriptor` | `ColorDescriptor` | ✅ 精确同名 |
| `ColorSpace` | imaging options/metadata 中的 `string` | ⚠️ 内联，未具名公开 |
| `ComponentSize` | `8 \| 16 \| 32` 内联 union | ⚠️ 内联，未具名公开 |
| `CreateTemporaryDocumentOptions` | — | ❌ core temporary document 未实现 |
| `CreateTemporaryDocumentResult` | — | ❌ core temporary document 未实现 |
| `DeleteTemporaryDocumentOptions` | — | ❌ core temporary document 未实现 |
| `GetLayerGroupContentsOptions` | `GetLayerGroupContentsOptions` | ✅ 精确同名 |
| `GetLayerParentResult` | — | ❌ core getLayerParent 未实现 |
| `GetLayerTreeOptions` | `DocumentCoreOptions` | ⚠️ 语义替代，未具名公开 |
| `HistorySuspendedOptions` | `HistorySuspendedOptions` | ✅ 精确同名 |
| `LayerCreateOptions` | `LayerCreateOptions` | ⚠️ 精确同名但只有 name/opacity/blendMode 子集 |
| `PixelFormat` | `PsImageData.pixelFormat: string` | ⚠️ 内联，未具名公开 |
| `RedrawDocumentOptions` | — | ❌ core redrawDocument 未实现 |
| `Type` | `PsImageData.type: string` | ⚠️ 内联，未具名公开 |
| `UnitTypeEnum` | `UnitTypeEnum` | ✅ 精确同名 |

### 271 个类型符号汇总校准

| 声明种类 | Shared 类型符号 | 精确同名公开 | 计入语义覆盖 | 未计入语义覆盖 |
| --- | ---: | ---: | ---: | ---: |
| class | 56 | 43 | 56 | 0 |
| enum | 104 | 1 | 103 | 1 |
| interface | 92 | 67 | 76 | 16 |
| type alias | 19 | 7 | 7 | 12 |
| **合计** | **271** | **118** | **242** | **29** |

Class 表中的 `PathPointInfo`、`SubPathInfo` 和五个颜色模型现在都以精确类名公开；旧 `*Input`/`*ColorView` 名称继续作为兼容类型。当前 export graph 与报告开头的 **118/271 精确同名**、**242/271 语义覆盖**一致。

### Value-only：17 个

这些不是 271 个类型分母的一部分，但决定 `require("photoshop")` 的模块实例是否有 WebView 对应。

| Shared value | 当前 WebView 对应 | 状态 |
| --- | --- | --- |
| `action` | `photoshop.action` | ⚠️ 5/7 |
| `app` | `photoshop.app` | ✅ 18/18 |
| `constants` | `photoshop.constants`，并平铺到 `photoshop` | ✅ 文档 100/100 |
| `core` | `photoshop.core` | ⚠️ 18/31 文档成员 |
| `imaging` | `photoshop.imaging` | ✅ 8/8 |
| `preferences` | `photoshop.preferences` | ✅ 根对象别名 |
| `preferencesCursors` | `photoshop.preferencesCursors` | ✅ |
| `preferencesFileHandling` | `photoshop.preferencesFileHandling` | ✅ |
| `preferencesGeneral` | `photoshop.preferencesGeneral` | ✅ |
| `preferencesGuidesGridsAndSlices` | `photoshop.preferencesGuidesGridsAndSlices` | ✅ |
| `preferencesHistory` | `photoshop.preferencesHistory` | ✅ |
| `preferencesInterface` | `photoshop.preferencesInterface` | ✅ |
| `preferencesPerformance` | `photoshop.preferencesPerformance` | ✅ |
| `preferencesTools` | `photoshop.preferencesTools` | ✅ |
| `preferencesTransparencyAndGamut` | `photoshop.preferencesTransparencyAndGamut` | ✅ |
| `preferencesType` | `photoshop.preferencesType` | ✅ |
| `preferencesUnitsAndRulers` | `photoshop.preferencesUnitsAndRulers` | ✅ |

实现还额外公开 `photoshop.preferencesNotifications`，但 Shared value 入口尚未声明该别名，因此不改变 17 个 value-only 分母。

## 验证情况

2026-07-15 在 RFC-0014 当前工作树运行了：

```text
pnpm typecheck
pnpm test:static
pnpm test:contract
pnpm build
pnpm exec tsc -p tsconfig.cdp-webview.json
pnpm test:uxp
```

结果：

- `pnpm test:static`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- contract：188/188 通过，0 failed，0 skipped；新增 class-completion contract 锁定 Layer/Text 精确成员清单、颜色/路径构造值类、Text owner identity、queued write、modal 策略、组内 Layers、完整 Layer 方法路由与 UXP File 滤镜参数验证。
- CDP WebView TypeScript 编译：通过。
- 真实 UXP：58 passed，0 failed，3 skipped；宿主 Photoshop 26.10.0 / UXP 9.0.1。
- `photoshop.text-complete-surface` 在自有临时文档中验证 TextItem 14/14、CharacterStyle 34/34、ParagraphStyle 15/15、TextWarpStyle 6/6，覆盖稳定 owner identity、代表性写后读和 point/paragraph conversion（宿主支持时）。
- `photoshop.layer-complete-surface` 验证 Layer 83/83、group `Layers`、组内 add/getByName、父子身份、非组 `layers === null` 与代表性排序/移动/滤镜调用；临时文档始终在 `finally` 关闭。
- `photoshop.path-items` 使用真实 `PathPointInfo`/`SubPathInfo` 构造实例创建路径；`photoshop.app-complete-surface` 验证真实 SolidColor 的 `rgb` 是公共 `RGBColor` 实例。
- 首次实机运行暴露两个离线 mock 未覆盖的边界：可空 collection 解码，以及临时文档关闭后 native Layer id 复用。最终实现允许 collection `null`，并把 Layer handle key 改为 `(documentId, layerId)`；修复后全套无级联 stale-handle 失败。
- 三个跳过项仍是两个 shell open 环境用例与 Photoshop 26.10 原生空状态 CountItems 缺陷，与 RFC-0014 无关。

## 建议的下一步

### 已完成：Class surface completion 交付闭环

1. RFC-0014 已记录 Text owner identity、本地值类、完整 Layer 方法表、group Layers、文件引用解码与 modal 策略。
2. 56 个 Shared class 已收敛为 55 个完整或基本完整、1 个部分、0 个缺失；三条目标簇 210/210。
3. typecheck、static、188 条 contract、build、CDP 编译和真实 Photoshop 58/0/3 均已通过。

### P1：单独设计 callback/event 协议

把 `Document.suspendHistory`、Core modal callback 与 Action/Core listeners 作为一个独立协议问题处理：需要可重入调用、取消、错误传播和生命周期，而不是继续扩张普通 RemoteClass。

### P2：补 Core 与 Action 模块长尾

在 callback/event 协议确定后，优先闭合 Core 的 13 个缺口与 Action 的两个 listener；临时文档、菜单/UI mutation 和 modal callback 必须继续保持 host authority。

### P3：严格命名与类型尾项

决定是否给 `PhotoshopImageData.isChunky` 增加兼容别名，并继续处理未具名公开的 Shared aliases/options；这些工作不应改变已经闭合的 class 运行时表面。

## 建议维护的长期指标

每个 Photoshop 批次更新四个数字：

1. 文档运行时成员覆盖：当前 **649/665（97.6%）**。
2. Shared 精确同名类型覆盖：当前 **118/271（43.5%）**。
3. Shared 语义类型覆盖：当前 **242/271（89.3%）**。
4. 实机 CDP：当前 **58 passed / 0 failed / 3 skipped**，宿主为 Photoshop 26.10.0 / UXP 9.0.1；跳过项与本批次无关。

这样能避免把“类型存在”“离线 contract 通过”和“真实 Photoshop 可用”混成一个覆盖率。
