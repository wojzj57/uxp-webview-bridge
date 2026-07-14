# Photoshop WebView API 开发覆盖审查

- 审查日期：2026-07-13
- 更新日期：2026-07-14
- 审查对象：`src/webview/photoshop-api`
- 参考文档：`uxp-document/ps-reference`
- 类型基线：`src/shared/types/photoshop`
- 原始 Git 基线：`5667f6ee306a6b5d63a0cf80a23ba558c0482080`
- 前一实现提交：`4555884a48078589d04219934791d89631bfc086`
- 本次实现：RFC-0013 Document 完整表面批次（本提交）

## 结论

Photoshop WebView 桥已完成 RFC-0013 的 Document 垂直切片。`PsDocument` 从 45/66 提升到 65/66；唯一保留缺口是需要通用 UXP→WebView 可重入回调协议的 `suspendHistory(callback)`。本批次同时闭合 Channels、ColorSampler(s)、CountItem(s) 与 LayerComp(s)，并加入 `saveAs` 的 UXP File 传输、模式/配置文件方法、采样颜色联合值和 Document/Channel 联合引用结果。

距离全量 DOM 对齐仍有明显距离。当前总进度如下：

| 口径 | 已覆盖 | 分母 | 覆盖率 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 文档运行时公开表面（语义口径） | 523 | 665 | **78.6%** | WebView 能实际跨桥读取、调用或同步获得的公开成员 |
| 其中：48 个类/集合文档 | 380 | 507 | **75.0%** | 全量长尾现在主要集中在 Text 与 Layer |
| Shared 类型精确同名公开 | 101 | 271 | **37.3%** | TypeScript export graph 的机械交集 |
| Shared 类型语义公开 | 230 | 271 | **84.9%** | 允许 `Document -> PsDocument` 等稳定桥接重命名 |
| RFC-0013 目标簇成员 | 77 | 78 | **98.7%** | Document 新增 20/21，加四个直接依赖簇 57/57 |

一句话判断：**App 与 Document 的主体表面已经闭合，类型语义覆盖超过八成，文档运行时表面接近八成；下一阶段应集中处理 Text 与 Layer 两条最大长尾。**

2026-07-14 本轮更新的设计、实现和验证证据集中在 RFC-0013 与本报告中；此前 Guide/Path 与 App 扩展仍对应 RFC-0012 和提交 `4555884`。

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

`PathPointInfoInput` 和 `SubPathInfoInput` 目前只覆盖创建路径所需的输入形状，缺少原生构造/`typename` 语义，因此仍记为“部分”。`PreferencesNotifications` 已补入 export graph，当前分母为 271。

## 文档运行时覆盖明细

### 类与集合

| 类型簇 | 已覆盖 | 文档成员 | 覆盖率 | 现状 |
| --- | ---: | ---: | ---: | --- |
| Photoshop app + Documents | 23 | 23 | **100%** | App 18/18；Documents 具备 parent/typename/add/getByName/length |
| Document | 65 | 66 | **98.5%** | 除需要可重入 callback transport 的 `suspendHistory` 外全部覆盖 |
| Layer + Layers | 39 | 87 | 44.8% | 标量、引用和基础变换可用；文本、组和滤镜是大缺口 |
| Channel + Channels | 16 | 16 | **100%** | Channel 与集合表面闭合 |
| Selection | 26 | 26 | **100%** | 文档表面闭合 |
| HistoryState + HistoryStates | 9 | 9 | **100%** | 文档表面闭合 |
| Guide + Guides | 11 | 11 | **100%** | 文档表面闭合 |
| Path/geometry 全簇 | 35 | 44 | 79.5% | RemoteObject/collection 35/35 完整；PathPointInfo/SubPathInfo 仍只有输入形状 |
| Text 全簇 | 10 | 79 | 12.7% | TextFont(s) 10/10；TextItem 与 Character/Paragraph/WarpStyle 未实现 |
| Preferences 全簇 | 68 | 68 | **100%** | 根对象与 12 个分类全部通过共享声明表驱动 |
| LayerComp + LayerComps | 22 | 22 | **100%** | 属性写入、方法、集合操作与稳定 `(docId,id)` 身份完整 |
| CountItem + CountItems | 21 | 21 | **100%** | 成员与 11 个组操作方法完整；实机空状态有 Adobe DOM 版本问题 |
| ColorSampler + ColorSamplers | 11 | 11 | **100%** | SampledColor/NoColor、move/remove 与集合操作完整 |
| Action + ActionSet | 16 | 16 | **100%** | 属性、父子引用及 delete/duplicate/play 已实现 |
| SolidColor | 8 | 8 | **100%** | 同步构造、活动色彩模型、`nearestWebColor`、`isEqual` 完整 |
| **合计** | **380** | **507** | **75.0%** |  |

### 模块表面

| 模块 | 已覆盖 | 文档成员 | 覆盖率 | 主要缺口 |
| --- | ---: | ---: | ---: | --- |
| constants | 100 | 100 | **100%** | 文档枚举全部同步公开 |
| photoshop.core | 18 | 31 | 58.1% | event listeners、`executeAsModal`、临时文档、菜单/UI mutation 等 |
| photoshop.action | 5 | 7 | 71.4% | `addNotificationListener`、`removeNotificationListener` |
| photoshop.imaging | 8 | 8 | **100%** | namespace API 闭合 |
| PhotoshopImageData | 12 | 12 | **100% 语义覆盖** | 文档叫 `isChunky`，Shared/实现叫 `chunky`，精确名称为 11/12 |

把类/集合与模块合并后，语义覆盖为 **523/665（78.6%）**。若严格要求成员名称与 Markdown 完全一致，则因 `isChunky/chunky` 差异为 **522/665（78.5%）**。

## 已经完成得比较好的部分

1. **常量层已闭合。** 文档快照中的 100 个枚举均可通过 `photoshop.Enum` 和 `photoshop.constants.Enum` 同步读取，不需要 RPC。
2. **Imaging 已形成完整资源模型。** 8 个 API、二进制 transport、`PsImageData` handle、`getData` 和显式清理均已落地。
3. **App 与直接依赖簇已经闭合。** App 18/18、Preferences 68/68、Action/ActionSet 16/16、TextFont(s) 10/10、SolidColor 8/8。
4. **Document 主体与直接依赖已经闭合。** Document 65/66、Channels 16/16、ColorSampler(s) 11/11、CountItem(s) 21/21、LayerComp(s) 22/22。
5. **跨模块资源与桥基础设施已被实用验证。** `app.open` 与 `document.saveAs` 都可解析 UXP File 代理；type registry、value registry、snapshot collection、引用去重、联合引用、queued writes 和 modal dispatch 已被多个类型簇复用。

## 还差什么

### 最大功能缺口

按未覆盖成员数量排序：

1. **Text 剩余 69/79。** TextFont(s) 已完成；下一层是 CharacterStyle、ParagraphStyle、WarpStyle、TextItem 与 `Layer.textItem`。
2. **Layer：还差 47/83。** 主要是 `layers`、`textItem`、front/back/copy/cut/clear/skew，以及约 40 个 `apply*` 滤镜方法。
3. **Document：只差 1/66。** `suspendHistory(callback)` 需要单独设计通用、可重入、可传播取消与错误的 UXP→WebView callback transport，不能用序列化函数或脱离原生 modal scope 的伪兼容替代。
4. **小而可闭合的尾巴。** Layers 只差 `typename`；App、Documents、Channels、Preferences、Action、SolidColor 及本批次三个依赖集合已不再是缺口。

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
| `CMYKColor` | `CmykColorView` | ⚠️ 值视图 | 能读取颜色字段，不能独立构造或作为原生 class 使用 |
| `Channel` | `PsChannel` | ✅ 改名完整 | 文档成员 10/10 |
| `Channels` | `Channels` | ✅ 同名完整 | 文档成员 6/6 |
| `CharacterStyle` | — | ❌ 缺失 | 33 个属性与 `reset` |
| `ColorSampler` | `PsColorSampler` | ✅ 改名完整 | 文档成员 7/7；采样颜色支持 `SolidColor | NoColor` |
| `ColorSamplers` | `ColorSamplers` | ✅ 同名完整 | 文档成员 4/4 |
| `CountItem` | `PsCountItem` | ✅ 改名完整 | 文档成员 7/7 |
| `CountItems` | `CountItems` | ✅ 同名完整 | 文档成员 14/14；包含全部组操作方法 |
| `Document` | `PsDocument` | ⚠️ 改名部分 | 文档成员 65/66，仅缺 `suspendHistory` callback transport |
| `Documents` | `Documents` | ✅ 同名完整 | 文档成员 5/5；快照成员保持 Document 身份 |
| `GrayColor` | `GrayColorView` | ⚠️ 值视图 | 能读取 `gray`，不能独立构造 |
| `Guide` | `PsGuide` | ✅ 改名完整 | 文档成员 7/7 |
| `Guides` | `Guides` | ✅ 同名完整 | 文档成员 4/4 |
| `HSBColor` | `HsbColorView` | ⚠️ 值视图 | 能读取颜色字段，不能独立构造 |
| `HistoryState` | `PsHistoryState` | ✅ 改名完整 | 文档成员 6/6 |
| `HistoryStates` | `HistoryStates` | ✅ 同名完整 | 文档成员 3/3 |
| `LabColor` | `LabColorView` | ⚠️ 值视图 | 能读取颜色字段，不能独立构造 |
| `Layer` | `PsLayer` | ⚠️ 改名部分 | 文档成员 36/83；缺 text/group/front-back/copy-cut/filter 等 |
| `LayerComp` | `PsLayerComp` | ✅ 改名完整 | 文档成员 16/16；写入遵守 queued/modal 语义 |
| `LayerComps` | `LayerComps` | ✅ 同名完整 | 文档成员 6/6 |
| `Layers` | `Layers` | ⚠️ 同名部分 | 缺 `typename`；Layer group 的 `layers` 也未接入 |
| `NoColor` | `PsNoColor` | ✅ 改名完整 | 作为 `SampledColor` 联合值的无颜色分支 |
| `ParagraphStyle` | — | ❌ 缺失 | 14 个属性与 `reset` |
| `PathItem` | `PsPathItem` | ✅ 改名完整 | 文档成员 15/15 |
| `PathItems` | `PathItems` | ✅ 同名完整 | 文档成员 5/5 |
| `PathPoint` | `PsPathPoint` | ✅ 改名完整 | 文档成员 6/6 |
| `PathPointInfo` | `PathPointInfoInput` | ⚠️ 输入子集 | 创建路径字段可用，缺构造实例与 `typename` |
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
| `RGBColor` | `RgbColorView` | ⚠️ 值视图 | 能读取颜色字段，不能独立构造 |
| `Selection` | `PsSelection` | ✅ 改名完整 | 文档成员 26/26 |
| `SolidColor` | `SolidColor` / `PsSolidColor` | ✅ 同名及兼容类型 | 默认白色、活动模型传输、`nearestWebColor`、`isEqual` 完整 |
| `SubPathInfo` | `SubPathInfoInput` | ⚠️ 输入子集 | 创建路径字段可用，缺构造实例与 `typename` |
| `SubPathItem` | `PsSubPathItem` | ✅ 改名完整 | 文档成员 5/5 |
| `SubPathItems` | `SubPathItems` | ✅ 同名完整 | 文档成员 2/2 |
| `TextFont` | `TextFont` | ✅ 同名完整 | family/name/postScriptName/style/parent/typename 6/6 |
| `TextFonts` | `TextFonts` | ✅ 同名完整 | length/parent/typename/getByName 4/4 |
| `TextItem` | — | ❌ 缺失 | TextItem 属性、style 引用与 4 个转换方法 |
| `TextWarpStyle` | — | ❌ 缺失 | warp 属性与 `reset` |
| `Tool` | `Tool` | ✅ 同名完整 | `id` 可写、`typename` 只读 |

Class 结论：

| 状态 | 数量 | class |
| --- | ---: | --- |
| 完整或基本完整 | 42 | 新增 Channels、ColorSampler(s)、CountItem(s)、LayerComp(s) 与 NoColor |
| 部分对应 | 10 | 5 个 color view、`Document`、`Layer(s)`、`PathPointInfo`、`SubPathInfo` |
| **完全缺失** | **4** | `CharacterStyle`、`ParagraphStyle`、`TextItem`、`TextWarpStyle` |

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

#### 精确同名公开：63 个

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
| Layer comp | `LayerCompCreateOptions`、`LayerCompRecaptureOptions` | ✅ 同名；用于 add/recapture |
| Generative | `GenerativeUpscaleOptions` | ✅ 同名；运行时方法按宿主版本能力返回原生错误 |

#### 桥接改名：9 个

| Shared interface | 当前 WebView 对应 | 状态/差异 |
| --- | --- | --- |
| `ActionModule` | `PhotoshopActions` | ⚠️ 5/7 文档函数；事件 listener 缺失 |
| `Bounds` | `ImagingBounds` | ⚠️ 当前为六字段超集值对象 |
| `BoundsSize` | `ImagingBoundsSize` | ✅ 改名 |
| `Core` | `PhotoshopCore` | ⚠️ Shared 成员 13/22 同名覆盖；另有 5 个文档超前方法 |
| `ICMYKColor` | `CmykColorView` | ⚠️ 只作为 SolidColor 内嵌值视图 |
| `Imaging` | `PhotoshopImaging` | ✅ 改名，8/8 API |
| `ImagingBounds2` | `ImagingRect` | ✅ 改名 |
| `PhotoshopImageData` | `PsImageData` | ✅ 改名；远程资源 handle，显式 dispose |
| `Size` | `ImagingSize` | ✅ 改名 |

#### 当前缺失：20 个

| 类型簇 | 缺失 interface | 被什么功能阻塞/使用 |
| --- | --- | --- |
| Apply Image | `ApplyImageOptions`、`ApplyImageSource` | `Layer.applyImage` 未实现 |
| Layer create | `GroupLayerCreateOptions`、`LayerCreateOptionsBase`、`PixelLayerCreateOptions`、`TextLayerCreateOptions` | `DocumentCreateOptions` 与 app.createDocument 已实现；Layer 创建仍是安全子集 |
| Text | `HyphenationProperties`、`JustificationProperties` | `ColorPickerOption` 与 Preferences 已实现；Text style 仍未实现 |
| Core/modal/history | `ExecuteAsModalOptions`、`ExecutionContext`、`GetLayerParentOptions`、`HistoryStateInfo`、`HistorySuspension`、`OnCancelCbArgument`、`PerformMenuCommandResult`、`ReportProgressOptions`、`ResumeHistorySuspensionOptions`、`SetExecutionModeOptions`、`SuppressResizeGripperOptions`、`SuspendHistoryContext` | mutating core、modal callback/event/history API 未实现 |

### Type alias：19 个

| Shared type alias | 当前 WebView 对应 | 状态 |
| --- | --- | --- |
| `ApplyImageChannelType` | — | ❌ `applyImage` 未实现 |
| `ApplyImageLayerType` | — | ❌ `applyImage` 未实现 |
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
| class | 56 | 32 | 50 | 6 |
| enum | 104 | 1 | 103 | 1 |
| interface | 92 | 63 | 72 | 20 |
| type alias | 19 | 5 | 5 | 14 |
| **合计** | **271** | **101** | **230** | **41** |

Class 表中 `PathPointInfoInput` 和 `SubPathInfoInput` 仍只有创建参数子集，因此不放进完整语义覆盖分子。当前 export graph 与报告开头的 **101/271 精确同名**、**230/271 语义覆盖**一致。

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

2026-07-14 在 RFC-0013 当前工作树运行了：

```text
pnpm test
pnpm exec tsc -p tsconfig.cdp-webview.json
pnpm test:uxp
```

结果：

- `pnpm test:static`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- contract：173/173 通过，0 failed，0 skipped；新增测试锁定 Document 65 成员清单、全部新集合 dispatch、联合引用/值解码、queued write 与 modal 策略。
- CDP WebView TypeScript 编译：通过。
- 真实 UXP：56 passed，0 failed，3 skipped；`photoshop.document-save-as` 在 Photoshop 26.10 写出 74,528,576 字节 PSD。
- 真实宿主：Photoshop 26.10.0、UXP 9.0.1。
- `photoshop.document-complete-surface` 验证 65 个可传输成员、mode/profile/histogram/zoom、ColorSampler(s)、LayerComp(s) 与 `sampleColor`；后者按 Photoshop 26.10 的真实要求进入 modal scope。
- `photoshop.document-save-as` 复制当前文档、保存到 UXP 临时 File，并在 `finally` 关闭副本、删除文件。
- Photoshop 26.10.0 在没有 Count Tool 数据的文档上构造原生 `CountItems` 时会抛出 `Cannot read properties of undefined (reading 'map')`；独立 CDP case 按测试规范记录环境诊断并跳过，完整 WebView/host 行为由 contract 硬覆盖。

## 建议的下一步

### 已完成：Document 批次交付闭环

1. RFC-0013 已记录 65/66 边界、`saveAs` bound namespace、引用联合、SampledColor/NoColor、集合身份与 modal 策略。
2. Document 主体、Channels 与三个直接依赖集合已经实现；`suspendHistory` 明确保留给通用 callback transport RFC。
3. 快速门禁、build、CDP 编译和真实 `pnpm test:uxp` 都纳入本批次交付证据。

### P1：完成 Layers 小尾巴并进入 Text 依赖链

1. 补 `Layers.typename`，关闭最后一个单成员集合缺口。
2. 按 `CharacterStyle / ParagraphStyle / WarpStyle -> TextItem -> Layer.textItem` 顺序实现 Text。
3. 继续复用声明表、type/value registry、host dispatch、contract 与最小 CDP 垂直切片。

### P2：系统化补 Layer 长尾

按依赖顺序实现：

```text
CharacterStyle / ParagraphStyle / WarpStyle
  -> TextItem
  -> Layer.textItem
```

TextFont(s)、SolidColor 与 Document 前置依赖已经完成。TextItem 接通后，优先补 Layer 的 group/text/front-back/copy-cut，再生成化处理 `apply*` 滤镜方法。

### P3：单独设计 callback/event 协议

把 `Document.suspendHistory`、Core modal callback 与 Action/Core listeners 作为一个独立协议问题处理：需要可重入调用、取消、错误传播和生命周期，而不是继续扩张普通 RemoteClass。

## 建议维护的长期指标

每个 Photoshop 批次更新四个数字：

1. 文档运行时成员覆盖：当前 **523/665（78.6%）**。
2. Shared 精确同名类型覆盖：当前 **101/271（37.3%）**。
3. Shared 语义类型覆盖：当前 **230/271（84.9%）**。
4. 实机 CDP：当前 **56 passed / 0 failed / 3 skipped**，宿主为 Photoshop 26.10.0 / UXP 9.0.1；跳过项是两个 shell open 环境用例与原生空状态 CountItems 缺陷。

这样能避免把“类型存在”“离线 contract 通过”和“真实 Photoshop 可用”混成一个覆盖率。
