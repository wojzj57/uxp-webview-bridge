# Module Development Guidelines

本文档记录 `uxp-webview-bridge` 后续桥接模块开发的强制规范。当前参考实现是 `os` 模块：

- `src/webview/uxp-api/modules/os`
- `src/uxp/uxp-api/modules/os`
- `src/shared/uxp-api/os-protocol.ts`

## 目标

新增模块时，保持 WebView 侧远程代理、UXP 侧 host adapter、shared protocol 三者职责清晰。

WebView 侧只暴露 remote namespace；真实 UXP、Photoshop、OS、文件系统等调用必须在 UXP 侧执行。

## 强制目录结构

每个 UXP API 桥接模块必须同时存在 WebView 和 UXP 两侧目录：

```txt
src/webview/uxp-api/modules/{moduleName}/
src/uxp/uxp-api/modules/{moduleName}/
```

每个模块目录必须至少包含三类基础文件。

WebView 侧：

```txt
src/webview/uxp-api/modules/{moduleName}/
  index.ts
  {moduleName}.ts
  types.ts
```

UXP 侧：

```txt
src/uxp/uxp-api/modules/{moduleName}/
  index.ts
  host.ts
  types.ts
```

复杂模块可以在目录内增加子文件，例如 serializers、validators、references、resource handles，但不能替代以上基础文件的职责。

一个模块目录只承载一个模块，不允许把多个无关模块合并进 catch-all adapter 或 runtime 文件。

## Shared Protocol

每个桥接模块必须有 shared protocol 文件：

```txt
src/shared/uxp-api/{moduleName}-protocol.ts
```

protocol 文件负责集中定义：

- stable module id
- allowed method names
- method name union type
- `is...MethodName`
- `assert...MethodName`

模板：

```ts
export const EXAMPLE_MODULE_ID = "uxp-api/modules/example";

export const EXAMPLE_METHOD_NAMES = [
  "firstMethod",
  "secondMethod"
] as const;

export type ExampleProtocolMethodName = (typeof EXAMPLE_METHOD_NAMES)[number];

const EXAMPLE_METHOD_SET = new Set<string>(EXAMPLE_METHOD_NAMES);

export function isExampleProtocolMethodName(
  method: string
): method is ExampleProtocolMethodName {
  return EXAMPLE_METHOD_SET.has(method);
}

export function assertExampleProtocolMethodName(
  method: string
): asserts method is ExampleProtocolMethodName {
  if (!isExampleProtocolMethodName(method)) {
    throw new Error(`Unsupported example method: ${method}`);
  }
}
```

shared protocol 只能放运行时中立的协议、常量、断言和 transport shape。不得放 concrete `os`、`uxp`、`photoshop`、`fs` 实现。

## WebView Module

WebView 侧 `{moduleName}.ts` 必须显式实现 remote namespace。

强制要求：

- 导出 `create{Module}Namespace(rpc)`。
- 导出默认 public namespace 实例，例如 `os`。
- 每个远程属性或方法必须逐项显式列出。
- 禁止用 method name 数组动态生成 public namespace。
- WebView 侧只能调用 bridge runtime，不能 import `src/uxp` 或访问真实 host API。

模板：

```ts
import { getBridgeRpcClient } from "@webview/runtime.js";
import { EXAMPLE_MODULE_ID } from "@shared/uxp-api/example-protocol.js";
import type { ExampleNamespace } from "./types.js";

interface ExampleRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createExampleNamespace(rpc: ExampleRpc): ExampleNamespace {
  return {
    firstMethod: (value) =>
      rpc.call<string>(EXAMPLE_MODULE_ID, "firstMethod", [value]),
    secondMethod: () =>
      rpc.call<number>(EXAMPLE_MODULE_ID, "secondMethod")
  };
}

export const example: ExampleNamespace = createExampleNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
```

显式列出每一项的目的是让参数、返回值、特殊序列化、property read/write 行为都在代码中可见。

## UXP Host Module

UXP 侧 `host.ts` 必须实现 host adapter。

强制要求：

- 导出 `{moduleName}ModuleAdapter`。
- adapter 必须声明 `moduleId`。
- 需要 capability gate 的模块必须声明 `capability`。
- dispatch 必须先做 method validation，再做参数校验，然后才访问真实 host API。
- 真实 UXP、Photoshop、OS、文件系统调用只能在 UXP 侧发生。

dispatch 顺序固定为：

1. 校验 method name。
2. 校验参数数量和参数形状。
3. 加载或访问真实 host API。
4. 调用真实方法。
5. 返回 transport-safe 结果。

模板：

```ts
import type { UxpModuleAdapter } from "@uxp/module-registry.js";
import {
  assertExampleProtocolMethodName,
  EXAMPLE_MODULE_ID
} from "@shared/uxp-api/example-protocol.js";

export const exampleModuleAdapter: UxpModuleAdapter = {
  moduleId: EXAMPLE_MODULE_ID,
  capability: "example",
  dispatch: dispatchExampleCall
};

export function dispatchExampleCall(
  method: string,
  args: readonly unknown[]
): unknown {
  assertExampleProtocolMethodName(method);

  if (method === "firstMethod") {
    if (args.length !== 1 || typeof args[0] !== "string") {
      throw new Error("example.firstMethod requires one string argument.");
    }

    const hostApi = getExampleHostApi();
    return hostApi.firstMethod(args[0]);
  }

  if (args.length > 0) {
    throw new Error(`example.${method} does not accept arguments.`);
  }

  const hostApi = getExampleHostApi();
  return hostApi[method]();
}
```

unsupported method 和 bad args 必须在真实 host API 访问之前失败，保证错误稳定、可测试，并避免不必要的 host 副作用。

## Types

类型必须放在本模块 `types.ts`。

WebView 侧 `types.ts` 优先从 native 类型推导 remote shape：

```ts
import type { example as nativeExample } from "@shared-types/uxp/internal/example.js";
export type ExampleMethodName = keyof typeof nativeExample & string;

export interface ExampleNamespace {
  firstMethod(value: string): Promise<string>;
  secondMethod(): Promise<number>;
}
```

当远程 API 和 native API 不完全等价时，允许用 `Omit`、专门 interface、serialized contract 类型修正远程形状。

UXP 侧 `types.ts` 放 host adapter 需要共享的 method name、native return shape、serialized value 等类型。不要把 WebView remote-only 类型放到 UXP 侧。

## Index Files

模块内 `index.ts` 只做本模块出口，不放实现逻辑。

WebView 侧示例：

```ts
export { createExampleNamespace, example } from "./example.js";
export type { ExampleMethodName, ExampleNamespace } from "./types.js";
```

UXP 侧示例：

```ts
export { dispatchExampleCall, exampleModuleAdapter } from "./host.js";
export type { ExampleMethodName } from "./types.js";
```

## Public API Rules

WebView public entrypoint 暴露直接 namespace：

```ts
import { configWebviewBridge, fs, os, path, uxp } from "uxp-webview-bridge/webview";
```

当前 `uxp` namespace 只实现 `uxp.versions`。不要在同一个模块里顺手恢复或扩展
`uxp.host`、`uxp.shell`、`uxp.storage`、`uxp.entrypoints`、`uxp.pluginManager`
或其他旧实现；这些能力必须等对应模块重构需求明确后再单独实现。

UXP public entrypoint 只暴露 setup：

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";
```

不要重新引入 deprecated factory/setup API：

- `createPhotoshopClient`
- `createBridgeClient`
- `createPhotoshopHost`
- `createBridgeHost`
- `configureBridgeClient`

## WebView CDP Module Tests

真实 WebView -> UXP host 行为测试应放在 WebView 模块旁边，使用共址 CDP case：

```txt
src/webview/uxp-api/modules/{moduleName}/{moduleName}.test.ts
```

对于不在 `modules` 下的 WebView 能力，放在对应实现目录旁边，例如：

```txt
src/webview/uxp-api/global-members/path/path.test.ts
```

共址测试只服务 `pnpm test:uxp`，不作为 Node contract test 运行，也不进入发布包。测试文件必须默认导出 `defineWebviewCdpCases([...])`：

```ts
import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "example.first-method",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const value = await bridge.example.firstMethod("input");
      assert.nonEmptyString(value, "example.firstMethod()");

      return { value };
    }
  }
]);
```

强制规则：

- case name 是全局名称，必须写完整模块前缀，例如 `fs.text-file-roundtrip`、`os.platform`、`uxp.versions`。
- `src/webview/uxp-api/modules/fs/fs.test.ts` 中的 case 必须以 `fs.` 开头。
- 测试对象只能来自 `ctx.bridge`，例如 `bridge.fs`、`bridge.os`、`bridge.path`。
- 禁止 value import 本模块实现，例如禁止从 `./fs.js` 导入 `createFsNamespace`。
- 允许 `import type` 类型。
- 禁止导入 Node API，例如 `node:fs`、`node:path`、`fs`、`path`。
- 真实 host 行为必须调用 public WebView namespace，再通过 bridge 到 UXP 侧执行。
- 涉及文件、document、resource handle 的测试必须做 best-effort cleanup。
- 如果运行环境缺少能力，使用 `skip(reason, diagnostics?)`，不要让无关环境差异变成失败。

`test/cdp/cases/*.mjs` 只保留 bridge-level 或 fixture-level cases，例如 `bridge.ping`、`bridge.remote-error-shape`。模块 namespace 行为不要再放进 `test/cdp/cases`，应共址到对应 WebView 模块。

如果 CDP case 需要默认关闭的 capability，例如 `fs`，只能在测试 fixture 的 `test/uxp-plugin/host.js` 中显式开启测试所需 capability，不要修改生产默认 capability。

## Verification

每个 `src` 变更必须至少通过：

```powershell
pnpm typecheck
pnpm test:static
```

完成实现或交付前运行：

```powershell
pnpm build
```

测试选择：

- 静态边界、目录对称、public export shape：放入 `test/static`。
- protocol、capability、dispatch、参数校验、mockable adapter 行为：放入 `test/contract`。
- 真实 UXP plugin、真实 WebView bridge、Photoshop/UXP host API 行为：放入共址 WebView CDP case。
- bridge runner、fixture、跨模块 smoke 行为：放入 `test/cdp/cases/*.mjs`。

涉及共址 CDP case 的变更，至少运行：

```powershell
pnpm exec tsc -p tsconfig.cdp-webview.json
pnpm test:uxp
```

## Checklist

新增或扩展模块时，用以下清单检查：

- WebView 和 UXP 模块目录对称。
- 两侧都有 `index.ts`、主实现文件、`types.ts`。
- shared protocol 定义了 module id、method names、assert helper。
- WebView 侧有 `create{Module}Namespace(rpc)`。
- WebView namespace 每个属性或方法都是显式实现。
- WebView 侧没有 import `src/uxp` 或真实 host API。
- UXP adapter 先校验 method，再校验 args，再访问 host API。
- host 返回值是 transport-safe 的。
- public entrypoint 只暴露允许的 namespace/setup API。
- 对应 static、contract、CDP 测试放在正确测试层。
- 模块真实 WebView 行为测试共址在 `src/webview/**/*.test.ts`。
- 共址 CDP case 使用 `defineWebviewCdpCases`，case name 带模块前缀。
- 共址 CDP case 不导入 Node API，也不 value-import 本地实现。
