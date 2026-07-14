# Photoshop App 覆盖更新（2026-07-14）

## 结论

本批按 RFC-0012 完成 `Photoshop -> PhotoshopApp` 低覆盖簇：报告口径从 **3/18 提升到 18/18**。同时闭合 App 直接暴露的 Documents、TextFont(s)、Tool、Action/ActionSet、完整 Preferences 家族，以及 SolidColor 的尾部缺口。

这不是对整个 Photoshop DOM 的 100% 覆盖声明。它只对本批明确选择的 App 垂直切片负责；Document/Layer/TextItem 等其余大簇继续按 roadmap 分批推进。

## 本批成员闭合

计数沿用 `notes/reports/2026-07-13-photoshop-webview-coverage-review.md` 的公开成员口径，忽略 `@ignore` 私有实现槽和 Array 原生成员。

| Adobe 类型 | 本批后覆盖 | 说明 |
| --- | ---: | --- |
| `Photoshop` / `PhotoshopApp` | **18/18** | 10 个属性、8 个方法；写入使用 RemoteClass 队列 |
| `Documents` | **5/5** | `length`、`parent`、`typename`、`getByName`、`add` |
| `TextFonts` | **4/4** | `length`、`parent`、`typename`、`getByName` |
| `TextFont` | **6/6** | 全部只读属性，`parent` 保持 App 身份 |
| `Tool` | **2/2** | `id` 可写、`typename` 只读 |
| `ActionSet` | **8/8** | 属性、嵌套 Action 快照和三个操作 |
| `Action` | **8/8** | 属性、父级身份和三个操作 |
| `Preferences` 根及 12 个分类 | **68/68** | 由共享声明表同时驱动 WebView descriptor 与 host 校验 |
| `SolidColor` | **8/8** | 补齐构造、`nearestWebColor`、`isEqual` 和活动色彩模型传输 |
| **本批目标簇合计** | **127/127** | 不等同于全库分母 |

相对报告基线，本簇新增闭合 118 个公开成员（原有 App 3 个和 SolidColor 6 个）。此外修复了 `PreferencesNotifications` 未进入 `all-types.d.ts` 的类型入口遗漏，并补充 exact-name `Photoshop` 公共别名。

## 设计结果

- `photoshop.app` 是稳定的持久 RemoteObject；WebView 使用确定性的 `photoshop.app` 引用，不在模块导入时发 RPC。
- App、Preferences、Tool 和 Action 名称写入走统一 queued-write 语义，后续读取或方法调用会等待写入完成。
- Documents、TextFonts 与 Action 嵌套列表使用快照集合；Document/Action/Font 的 remote id 维持稳定身份。
- Preferences 的 68 个成员只维护一份运行时中立声明，避免 WebView 与 UXP allowlist 漂移。
- `SolidColor` 保持无句柄的本地值对象：默认白色、同步构造、按最近访问的色彩模型编码；宿主侧重建原生 SolidColor。
- `app.open` 接受 UXP `File` 代理：WebView 编码 storage reference，Photoshop host 通过 storage host 的受控 resolver 取回原生 Entry；旧 path/options 输入仍保留。
- 创建文档和 Action/Preferences 等变更遵守 modal 边界；纯读取不进入 modal。

## 验证证据

- Contract：App 18 成员存在、写入顺序、Documents 身份、SolidColor、UXP File 跨模块打开、Preferences/Action/TextFont host dispatch 和坏参数前置拒绝。
- Real CDP：`photoshop.app-complete-surface` 读取 App、102 个 color profile、459 个字体、Tool、Preferences、ActionTree、前后景色和 `updateUI`。
- Real CDP：`photoshop.app-create-document` 创建唯一命名的 32×24 文档，通过 Documents/getByName 验证身份，并在 `finally` 关闭。
- Real host：Photoshop 26.10.0、UXP 9.0.1。
- 最终门禁以本次提交前的实际命令结果为准：`pnpm test`、`pnpm build`、CDP TypeScript 编译和 `pnpm test:uxp`。

## 剩余边界

- `showAlert` 只做 contract 验证，避免无人值守 CDP 被模态对话框阻塞。
- SolidColor 的 WebView 色彩空间换算是确定性的标准换算，不读取用户 Photoshop Color Settings；真正经过 Photoshop 设置的读取值仍由宿主序列化。
- `currentDialogMode`、`validation`、原生 constructor/polyfill slots 不属于本报告 18 成员分母，未伪造成远程 API。
