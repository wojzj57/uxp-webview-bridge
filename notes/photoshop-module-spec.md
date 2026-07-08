# Photoshop 模块技术规范总纲

本文档是 `photoshop` 模块(Document / Layer 等有状态 DOM 对象桥接)开发前确定的技术规范。
参考文档来源:https://developer.adobe.com/photoshop/uxp/2022/ps-reference/
详细决策记录见 `docs/adr/0002` ~ `docs/adr/0008`,术语见 `CONTEXT.md`。

规范全部遵循「先定规范、后分批开发」;常量与功能按批次增量落地。

---

## 0. 模块归属

- 模块目录名:`photoshop`,归属 `photoshop-api` 命名空间(`src/{webview,uxp}/photoshop-api/modules/photoshop/`)。
- capability:`photoshop`(已存在于 `BridgeCapabilities`)。
- 目录对称:`src/webview/photoshop-api/modules/photoshop/` 与 `src/uxp/photoshop-api/modules/photoshop/`。
- shared protocol:`src/shared/photoshop-api/photoshop-protocol.ts`。
- shared 常量:`src/shared/photoshop-api/photoshop-constants.ts`。

---

## 1. RemoteClass(WebView 通用远程对象基类)—— ADR 0002 / 0008

- 位置:WebView 通用基础设施层 `src/webview/uxp-api/remote/`,**不**放在 photoshop 模块内。
- 只放横切能力:远程对象通讯基类、引用编解码、WeakRef 身份缓存。**不含任何 Photoshop 语义。**
- 职责:持有远程引用、异步读属性、写属性入队、调用远程方法、提供 static `batchGet`/`batchSet`。
- 子类(`PsDocument` / `PsLayer` ...)只做**声明**,不含通讯逻辑。

### 属性声明方式(描述符表 + declare)

子类提供静态描述符表(运行时)+ `declare` 类型成员(编译期),二者由静态测试锁定一致。

```ts
class PsLayer extends RemoteClass {
  static properties = {
    name:    { writable: true,  mutating: true },
    opacity: { writable: true,  mutating: true },
    id:      { writable: false, mutating: false },
    bounds:  { writable: false, mutating: false, valueKind: "Bounds" }, // value 对象
    parent:  { writable: false, mutating: false, refType: "Layer" },    // RemoteObject
  } as const;

  static methods = {
    duplicate: { mutating: true },
    delete:    { mutating: true },
    scale:     { mutating: true },
  } as const;

  // 类型声明(不产生运行时代码;给 TS 和用户补全)
  declare readonly id: Promise<number>;
  declare name: Promise<string>;
  declare opacity: Promise<number>;
  declare readonly bounds: Promise<Bounds>;
  declare readonly parent: Promise<PsLayer | null>;
}
```

- getter 返回 `Promise<T>`;getter/setter 同名可不同类型(`get name(): Promise<string>` / `set name(v: string)`)。
- **代价**:属性名写两遍(表 + declare),必须有静态测试断言 `keyof properties` === declare 键集合。
- **代价**:getter 返回 Promise,不能像 Adobe 同步示例那样 `layer.opacity - 10`,必须 `(await layer.opacity) - 10`。

---

## 2. 属性读写与批量语义 —— ADR 0003

- **读**:`await layer.name`,异步。read / method call 前 `await` 实例的写队列(read-your-writes)。
- **写(实例 setter)**:`layer.opacity = 80` 立即各发一次 RPC(照搬 XMP `#queue` promise 链,fire-and-forget)。N 个属性 = N 次往返。
- **批量(高级用户,实例方法)**:
  - `layer.batchGet(propNames[])` —— 一次 RPC 读本对象多属性。
  - `layer.batchSet(partialProps)` —— 一次 RPC 设本对象多属性;入参约束为**可写属性**的 partial(传只读属性编译期报错)。
  - 只作用于**单个** RemoteObject(`this`);不跨对象。
- UXP host 必须实现对应的批量 dispatch 方法(`{reference, propNames}` / `{reference, props}`),协议里每模块多一对 `batch*` 方法名常量。

---

## 3. 远程引用与 handle 注册表 —— ADR 0004

- **引用信封**:统一形状 `{ kind: "uxp.remote.ref", type: string, id: string }`,复用 shared `BridgeRemoteReference`。`type` = DOM 类名(`"Document"` / `"Layer"` ...)。
- **UXP 侧通用 handle 注册表**:`createRemoteHandleRegistry()` —— id 分配、get、dispose、TTL touch、prune,一份实现。每个模块 adapter 持有**独立** registry 实例(handle id 空间隔离)。
- 通用 registry **不含 Photoshop 语义**,只管 id 与生命周期。
- **WebView 侧**:RemoteClass 负责持有 `#referencePromise`、编码参数时把 RemoteObject 转引用信封、解码返回值时把信封转回对应 RemoteObject 子类实例。

---

## 4. 身份去重与对象分类 —— ADR 0005

### 三类对象

1. **值对象(Value)**:纯数据、无方法、无远程状态。序列化为 plain JSON,不进 registry。例:`Bounds`、`histogram`、采样 `Color`。需要每类型显式 UXP 侧序列化器(拷哪些字段)。
2. **RemoteObject**:有状态、有 mutating 方法。进 registry,按真实 id 去重,WebView WeakRef 缓存保证 `===`。例:`Document`、`Layer`。
3. **集合包装(Collection wrapper)**:如 `Layers`。**WebView 本地对象,无远程 handle**。内部持有一份成员 id 数组快照(一次 RPC),按序号访问时才把 id 懒解析为 RemoteObject(走身份缓存)。

### 身份去重(三层)

- 通用 registry:`getOrCreate(key, factory)`,按外部 key 去重,无语义。
- 模块 host:计算 key —— `Layer:${nativeLayer.id}`、`Document:${nativeDoc.id}`。同一真实对象 → 同一 key → 同一 reference id。
- WebView RemoteClass:`referenceId → RemoteObject` 用 `WeakRef` + `FinalizationRegistry` 缓存,保证 `===` 且不泄漏。

### 集合语义

- 快照是**取的那一刻**的视图,**不自动刷新**。
- 访问已不存在的 id(如图层在别处被删)→ 抛 `BridgeRemoteError`,用户需重新 `await doc.layers`。
- 容器不保证 `===`(`arr1 !== arr2`),但解析出的元素保证 `===`(`arr1[0] === arr2[0]`)。

---

## 5. 常量 —— ADR 0006

- **运行时值**:`as const` 对象放 `src/shared/photoshop-api/photoshop-constants.ts`,两侧共享 import。例:`LayerKind`、`BlendMode`、`AnchorPosition`、`ElementPlacement`、`SaveOptions` ...
- **类型**:对齐 `@shared-types/photoshop` 的 Adobe enum 类型(.d.ts 只有类型,无运行时值,故须手工誊写运行时值)。
- **暴露**:WebView namespace 上暴露(如 `photoshop.LayerKind`),用户 `photoshop.LayerKind.TEXT` 取值。
- **按需增量誊写**:只誊当前批次用到的枚举;每个枚举标注 Photoshop 文档来源,并加静态测试断言与 `@shared-types/photoshop` 类型兼容。用不到的不提前誊。

---

## 6. executeAsModal 边界 —— ADR 0007

- 每个 setter / 方法在描述符表标注 `mutating: true | false`。
- **UXP 侧 dispatch** 按标注决定:`mutating` → `require('photoshop').core.executeAsModal(() => realCall())`;非 mutating → 直接调用。
- WebView 侧**不知道** modal 存在(执行语义由 UXP host 拥有)。
- `batchSet` 多个 mutating 属性 → 整批包在**一个** `executeAsModal` scope(一次 RPC = 一个 modal scope)。
- v1 **不做** UXP 侧自动串行化;并发 mutating 调用产生的 modal 冲突错误直接作为 `BridgeRemoteError` 透传,调用方自行串行化。

---

## 7. 目录结构(遵循 module-development-guidelines.md)

Photoshop 相关代码全部归属 `photoshop-api` 命名空间(三层对称:shared / webview / uxp);
通用远程对象底座(RemoteClass、handle-registry)属于横切基础设施,保留在 `uxp-api/remote/`,**不**放进 photoshop-api。

```txt
src/shared/photoshop-api/       # Photoshop 共享契约(runtime-neutral)
  photoshop-protocol.ts        # module id、方法名、assert helper、引用/序列化 shape
  photoshop-constants.ts       # 枚举运行时值(按需增量)

src/webview/uxp-api/remote/    # 通用底座(ADR 0008),非 photoshop 专属
  remote-class.ts              # RemoteClass 基类
  reference.ts                 # 引用编解码
  identity-cache.ts            # WeakRef 身份缓存

src/webview/photoshop-api/modules/photoshop/
  index.ts
  photoshop.ts                 # namespace(app / activeDocument ...)
  document.ts / layer.ts ...   # PsDocument / PsLayer 等 RemoteClass 子类
  types.ts
  photoshop.test.ts            # 共址 CDP case(case name 带 photoshop. 前缀)

src/uxp/uxp-api/remote/        # 通用底座(ADR 0004),非 photoshop 专属
  handle-registry.ts           # createRemoteHandleRegistry()

src/uxp/photoshop-api/modules/photoshop/
  index.ts
  host.ts                      # adapter + dispatch(先校验 method,再校验 args,再 modal 包裹访问 host API)
  types.ts
```

> **模块 id 约定**:`PHOTOSHOP_MODULE_ID = "photoshop-api/modules/photoshop"`,镜像目录路径。
> **对称约束**:`test/static/check-boundaries.mjs` 对 `photoshop-api` 强制 `src/webview` 与 `src/uxp`
> 的 `modules/{name}` 目录对称;共址 CDP case 名前缀由目录推导(`photoshop-api/modules/photoshop` → `photoshop.` 前缀)。

---

## 8. 分批开发建议顺序(待后续拆分)

1. 通用底座:`remote/`(RemoteClass、引用编解码、WeakRef 缓存)+ UXP `handle-registry` + 引用信封协议。
2. `PsDocument` 最小集:`app.activeDocument`、只读属性(width/height/name/id)、`close`。
3. `PsLayer` + 值对象 `Bounds` + 集合 `Layers`(`doc.layers`)。
4. mutating 方法 + executeAsModal(createLayer / scale / delete ...)。
5. batchGet/batchSet。
6. 常量随各批次按需誊写。

每批次交付前:`pnpm typecheck` + `pnpm test:static`;交付前 `pnpm build`;涉及共址 CDP case 另跑 `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp`。
