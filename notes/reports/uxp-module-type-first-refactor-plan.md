# UXP 模块类型优先重构升级方案

审查对象：

- `src/webview/uxp-api/modules/uxp`
- `src/uxp/uxp-api/modules/uxp`
- `src/shared/contracts/uxp.ts`
- `src/types/uxp/**`
- `uxp-document/uxp-api/reference-js/modules/uxp`

目标约束：

1. 所有 UXP API 类型以 `src/types/uxp` 为准。
2. 开始实现前，先把类型复制或派生到 WebView 模块本地。
3. WebView 实现每个模块前，先导入对应类型，再实现该类型。
4. 例：实现 `shell` 时，先导入 `src/types/uxp/internal/shell.d.ts` 对应的 `Shell` 类型，再实现 `Shell` 形状。

## 结论

这个重构方向是对的，但不能直接“按原生类型一比一实现 WebView 对象”。原因是 WebView 侧暴露的是 Remote Namespace，不是真实 UXP object。原生 UXP 类型里很多属性是同步值，例如 `host.name: string`、`versions.uxp: string`、`storage.secureStorage.length: number`；WebView 远程读取必须是异步，当前实现用 `Promise<string>` / `Promise<number>` 表达这个事实。

因此推荐模型是：

- `src/types/uxp` 是 Native Type Source。
- WebView 模块拥有一份 WebView Type Mirror。
- WebView 实现不手写 API 类型，而是从 Native Type Source 派生 Remote Type。
- shared contract 不再承担完整 API 类型职责，只保留协议、method id、transport DTO、序列化工具。

也就是说，类型以 `src/types` 为准，但 WebView 侧实现的是“从原生类型机械派生出来的远程类型”，不是伪装成同步原生对象。

## 当前代码问题

### 1. `src/shared/contracts/uxp.ts` 过载

当前这个文件同时承担：

- RPC module id 和 method name 清单
- WebView-facing namespace 类型
- host 返回 DTO 类型
- secureStorage transport 编解码
- unsupported XMP/localFileSystem 类型

这导致类型来源绕过了 `src/types/uxp`。例如 WebView `shell.ts` 现在导入的是 `UxpShell`：

```ts
import type { UxpShell } from "../../../../shared/contracts/uxp.js";
```

它没有导入 `src/types/uxp/internal/shell.d.ts` 的类型。

### 2. `src/types/uxp` 当前不可直接按接口名导入

你要求实现 `Shell` 前导入 `Shell` 类型。但当前 `src/types/uxp/internal/shell.d.ts` 中的 `interface Shell` 没有 `export`，只有：

```ts
export const shell: Shell;
```

`Host`、`Versions`、`Storage`、`Entrypoints` 也有类似问题。可以通过 `typeof shell` 间接取类型，但不能直接 `import type { Shell }`。

这意味着重构第一步必须是“类型源硬化”：

- 要么把这些 interface 改成 `export interface Shell`。
- 要么生成 WebView mirror 时导出别名，例如 `export type Shell = typeof shell`。

推荐第二种过渡方式，因为它不急着大改原始 `.d.ts` 内容。

### 3. 原生类型与远程可实现性冲突

几个典型冲突：

- `host.name` 在原生类型是 `string`，WebView 只能远程读，合理类型应为 `Promise<string>`。
- `versions.plugin` 同理。
- `entrypoints.getPanel()` 原生返回 `UxpPanelInfo`，WebView 返回的是远程代理对象，其中 `menuItems` 继续通过 RPC 操作。
- `storage.localFileSystem` 原生类型非常大，但当前 bridge 设计明确不支持真实 Entry/File/Folder。
- `shell.openExternal` 在 `src/types/uxp/internal/shell.d.ts` 签名为 `void`，但注释和当前实现语义都像 `Promise<string>`。如果坚持 `src/types` 为准，必须先修这个类型源，不能在实现里另写一个返回类型。

### 4. host adapter 使用手写 Host 类型

`src/uxp/uxp-api/modules/uxp/host-module.ts` 手写了 `UxpHostModule`、`UxpHostPlugin`、`UxpHostPanelInfo` 等类型。这些也应逐步改成从 `src/types/uxp` 派生，否则 UXP host side 和 WebView side 会继续各自漂移。

### 5. 测试仍锁定旧行为

现有 contract/CDP 测试锁定了：

- `storage.localFileSystem` 是 unsupported provider。
- `xmp` 是 unsupported façade。
- `entrypoints.setup` 不允许从 WebView 调用。
- `pluginManager`、`entrypoints`、`secureStorage` 都受 capability gate 管控。

重构不能只改类型和实现，还必须同步测试语义。尤其是如果 `openExternal` 改成按类型返回 `void` / `Promise<void>`，测试要跟着改。

## 推荐架构

### 目录形态

建议把 WebView UXP 类型镜像放到模块内部：

```txt
src/webview/uxp-api/modules/uxp/
  types/
    native/
      host.d.ts
      versions.d.ts
      shell.d.ts
      storage.d.ts
      entrypoints.d.ts
      ...
    remote.ts
```

`native/` 是从 `src/types/uxp/internal` 复制或生成出来的只读类型镜像。实现文件只从本地 mirror 导入，不跨 runtime boundary，也不直接从 `src/types` 的远处路径导入。

示例：

```ts
import type { shell as nativeShell } from "./types/native/shell.js";
import type { RemoteNamespace } from "./types/remote.js";

type Shell = RemoteNamespace<typeof nativeShell>;

export function createShellNamespace(rpc: UxpRpc): Shell {
  return {
    openPath: (path, developerText) =>
      callUxp(rpc, "shell.openPath", [path, developerText]),
    openExternal: (url, developerText) =>
      callUxp(rpc, "shell.openExternal", [String(url), developerText])
  };
}
```

如果希望真的写 `import type { Shell } ...`，则生成 mirror 时新增导出：

```ts
export type Shell = typeof shell;
```

### 类型派生规则

需要定义一个统一的 remote transform，而不是每个模块手写：

```ts
type RemoteValue<T> =
  T extends (...args: infer Args) => infer Return
    ? (...args: Args) => Promise<Awaited<Return>>
    : T extends object
      ? RemoteNamespace<T>
      : Promise<T>;

type RemoteNamespace<T> = {
  readonly [K in keyof T]: RemoteValue<T[K]>;
};
```

这个规则要有显式例外：

- unsupported API：保留原形状，但方法返回 `never` 或 `Promise<never>`，调用时抛明确错误。
- local constants：例如 `storage.domains`、`storage.formats`、`storage.fileTypes` 可以本地同步返回，不需要 RPC。
- constructor/class：例如 XMP、Entry/File/Folder 不应自动 remoteify；必须显式决定是 unsupported、remote handle，还是不导出。
- callback API：例如 `entrypoints.setup` 不应从 WebView bridge 调用，继续显式禁止。

### shared contract 的新职责

`src/shared/contracts/uxp.ts` 应拆分：

```txt
src/shared/contracts/uxp/
  protocol.ts        // module id, method ids, operation names
  transport.ts       // serialized plugin/panel/menu/storage/xmp DTO
  secure-storage.ts  // bytes transport helpers
  guards.ts          // method/assertion guards
```

不要继续在 shared 里定义 `UxpNamespace`、`UxpShell`、`UxpStorage` 这种 WebView-facing API 类型。WebView API 类型应从 WebView mirror 派生。

## 分阶段重构计划

### Phase 1：类型源硬化

目标：让 `src/types/uxp` 成为可被派生的真实 source of truth。

任务：

- 修正 `shell.openExternal` 的返回类型。建议改为 `Promise<string>`，因为注释和当前 UXP host 实现都表达“返回空字符串或错误字符串”。
- 给非导出的核心接口提供导出能力，或在生成 mirror 时导出别名。
- 明确哪些 `src/types/uxp` 类型属于原生 UXP，哪些属于 bridge 远程类型。
- 加一个检查，防止 WebView UXP API 类型继续从 `src/shared/contracts/uxp.ts` 手写导入。

验收：

- `Shell/Host/Versions/Storage/Entrypoints` 都能被 WebView 侧以类型方式使用。
- `pnpm typecheck` 通过。

### Phase 2：建立 WebView Type Mirror

目标：实现前先复制类型进 WebView。

任务：

- 新增 `src/webview/uxp-api/modules/uxp/types/native/`。
- 复制 `src/types/uxp/internal/*.d.ts` 中与 `uxp` 模块相关的文件。
- 新增一个同步脚本，例如 `scripts/sync-uxp-webview-types.mjs`，让复制不是手工漂移。
- 新增 static test：mirror 内容必须和 `src/types/uxp/internal` 同步，或必须由脚本生成。

验收：

- WebView 模块实现只从本地 `./types/native/*.js` 做 `import type`。
- 手动改 `src/types/uxp/internal/shell.d.ts` 后，测试能提示 mirror 未同步。

### Phase 3：重写 WebView 模块类型依赖

目标：每个 WebView 模块先导入 native/mirror 类型，再实现 remote 类型。

改造顺序：

1. `host`
2. `versions`
3. `shell`
4. `userInfo`
5. `storage.secureStorage`
6. `entrypoints`
7. `pluginManager/script`
8. `localFileSystem/xmp` unsupported façade

每个模块都遵循：

```ts
import type { host as nativeHost } from "./types/native/host.js";
import type { RemoteNamespace } from "./types/remote.js";

type Host = RemoteNamespace<typeof nativeHost>;

export function createHostNamespace(rpc: UxpRpc): Host {
  ...
}
```

验收：

- WebView 侧不再从 shared contract 导入 `UxpShell/UxpStorage/UxpNamespace`。
- WebView `uxp` 总 namespace 类型由 native mirror 派生组合得到。

### Phase 4：重写 UXP host 类型依赖

目标：host adapter 也从 `src/types/uxp` 派生，减少手写类型漂移。

任务：

- `requireUxp()` 类型改为原生 `uxp` module 类型，而不是手写完整 `UxpHostModule`。
- 对 host-only 缺口使用窄化 helper，而不是复制一份完整 host shape。
- `pluginManager/script/userInfo` 当前不在 `src/types/uxp/index.d.ts` 导出，需要先补类型源。

验收：

- `host-module.ts` 不再维护一份大而重复的 native UXP shape。
- UXP dispatch 的参数验证仍保持显式，不因为类型存在就信任 WebView 输入。

### Phase 5：扩展 contract tests

目标：锁定“类型优先”的新规则。

新增测试：

- WebView `shell` 实现必须满足 `RemoteNamespace<typeof nativeShell>`。
- `host/versions/storage/entrypoints` 同理。
- `src/shared/contracts/uxp.ts` 不得导出 WebView API namespace 类型。
- `localFileSystem/xmp` 的 unsupported 类型和 runtime 行为一致。
- `shell.openExternal` 拒绝 `file:` scheme 时大小写不敏感。
- entrypoints remote reference registry 支持清理或 runtime destroy。

## 推荐不要做的事

- 不要把 WebView 对象伪装成同步 native UXP object。远程属性不能同步读取。
- 不要在 shared contract 继续手写完整 API 类型。
- 不要直接在 WebView 实现里长路径导入 `src/types/uxp/internal/*.d.ts`；按你的要求复制进 WebView 后，从本地 mirror 导入。
- 不要一次性实现完整 `localFileSystem`、Entry/File/Folder、XMP。它们需要 remote handle 生命周期和安全模型，不是简单类型复制能解决。
- 不要为了让类型好看而移除 capability gate。类型只约束编译期，WebView 输入仍然不可信。

## 关键待确认问题

问题：WebView 侧最终 public API 是否允许是“原生类型的远程异步派生”，而不是一比一同步原生形状？

我的推荐答案：允许，而且必须允许。否则 `host.name: string`、`versions.uxp: string`、`secureStorage.length: number` 这些原生同步属性无法在 WebView 远程环境中真实实现，只能做缓存或假同步，这会破坏 Bridge Library 的运行时边界。

如果这个答案成立，后续实现就按 `RemoteNamespace<typeof nativeX>` 推进；如果你坚持 WebView API 必须完全同步原生形状，那需要先设计启动时快照缓存、失效策略和错误语义，这会显著改变现有 bridge 架构。

