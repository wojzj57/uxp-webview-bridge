# UXP WebView Bridge Development Unit

本文档定义一个给 AI 执行的开发单元流程。每个单元只实现用户指定的一个 `uxp-document/` 模块或模块切片，完成实现、审查、测试、修复和本地提交后，才允许进入下一个单元。

## 适用输入

用户输入必须指定要开发的模块范围，例如：

```txt
开发 uxp-document/uxp-api/reference-js/modules/os
开发 uxp-document/ps-reference/modules/constants.md
开发 Photoshop action.batchPlay bridge
```

如果输入没有明确到一个模块、模块文件、命名空间或可独立测试的切片，先追问一个问题并等待回答。不要一次问多个问题。

## 固定上下文

每个开发单元开始前，AI 必须重新读取并遵守：

- `AGENTS.md`
- `CONTEXT.md`
- `test/README.md`
- `test/TESTING.md`
- 用户指定的 `uxp-document/` 模块文档
- 相关的本地类型定义，例如 `src/types/uxp/` 或 `src/types/photoshop/`
- 相关的现有实现、测试和入口文件

这些文件是当前单元的约束来源。实现 UXP 或 Photoshop API 形状时，以本仓库内 `uxp-document/` 和本地类型定义为准，不凭记忆补 API。

## 单元边界

一个开发单元只能包含用户指定模块所必需的变更：

- 允许修改 `src/shared` 中的协议、错误、capability、transport shape、模块契约和运行时中立工具。
- 允许修改 `src/webview` 中对应模块的远程代理、WebView 命名空间导出和 WebView-facing 类型。
- 允许修改 `src/uxp` 中对应模块的 host adapter、真实 UXP/Photoshop 调用、capability enforcement、序列化和 resource handle 生命周期。
- 允许新增或修改 `test/static`、`test/contract`、`test/cdp/cases` 和 fixture 中与该模块直接相关的测试。
- 不允许引入应用 shell、产品 UI、业务 workflow、无关重构或顺手修复。

如果实现过程中发现另一个模块必须先完成，停止当前实现，向用户说明依赖关系，并把当前单元标记为 blocked。不要把两个模块合并成一个单元。

## 目录和公共 API 规则

新增或扩展模块时必须保持 WebView 和 UXP 两侧对称。

UXP API 模块使用：

```txt
src/webview/uxp-api/modules/{moduleName}/
src/uxp/uxp-api/modules/{moduleName}/
```

Photoshop API 模块使用：

```txt
src/webview/photoshop-api/modules/{moduleName}/
src/uxp/photoshop-api/modules/{moduleName}/
```

一个模块目录只承载一个模块。index 文件只能 re-export 本模块本地 public surface，不能塞入其他模块实现。

WebView 公共入口必须继续直接导出远程命名空间：

```ts
import { configWebviewBridge, os, photoshop, uxp } from "uxp-webview-bridge/webview";
```

UXP 公共入口只能暴露一个 setup 方法：

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";
```

不得重新引入 `createPhotoshopClient`、`createBridgeClient`、`createPhotoshopHost`、`createBridgeHost`、`configureBridgeClient` 等 deprecated factory-style API。

## 执行流程

### 1. 需求审查

先确认用户指定的模块属于哪一类：

- `uxp-document/uxp-api/reference-js/modules/*`：UXP API bridge 模块。
- `uxp-document/ps-reference/*`：Photoshop API bridge 模块。
- `uxp-document/uxp-api/reference-js/global-members/*`：只有在明确需要桥接时才进入 `src`，否则不要把 WebView 平台能力误当 UXP host 模块。

审查时必须回答：

- 原生 API 的方法、属性、参数和返回值是什么。
- 哪些调用必须在 UXP host 侧执行。
- WebView 侧应该暴露 remote namespace、RemoteClass 还是普通 async 方法。
- 是否需要 capability gate。
- 是否涉及二进制传输、resource handle、modal transaction、pending property write queue 或 origin/security 语义。
- 应该落入 static、contract、UXP CDP 哪些测试门禁。

如果这些问题无法从代码和文档中查清，只问用户一个最关键的问题，等待回答后继续。

### 2. 实现设计

在改代码前形成一个小设计，至少包括：

- 要新增或修改的模块目录。
- `src/shared` 契约和 transport shape。
- WebView 远程代理或 namespace 形状。
- UXP adapter dispatch、参数校验、capability 校验和返回值序列化。
- 要新增的测试类型和测试文件。

设计必须优先复用现有模式，例如 `os`、`fs`、`module-registry`、`rpc-client`、`rpc-host`、`BridgeRemoteError` 和 `capabilities` 的实现方式。

### 3. 实现

按依赖顺序实现：

1. `src/shared`：定义模块 ID、方法名、类型、transport-safe value、assert/helper。
2. `src/webview`：实现 remote namespace 或 RemoteClass。WebView 代码只能调用 bridge runtime，不能 `require("photoshop")`、`require("uxp")`、`require("os")`、`require("fs")`，也不能从 `src/uxp` 导入。
3. `src/uxp`：实现 host adapter，真实调用 `require(...)` 或 Photoshop API，做 capability check、参数校验、错误传播、资源回收。
4. 入口文件：只导出该模块需要暴露的 public surface，不增加第二套 setup API。

实现过程中发现需求和仓库现实冲突时，回到需求审查，不要擅自改 API 方向。

### 4. 测试

根据变更类型补测试：

- Static Gate：涉及 `src` 结构、公共入口、runtime boundary、模块目录时，必须保证 `pnpm test:static` 覆盖。
- Contract Gate：协议、错误、capability、registry dispatch、mock adapter、transport serialization 等可在 Node/mock 中验证的行为，写到 `test/contract/**/*.test.mjs`。
- UXP CDP Gate：真实 UXP plugin、真实 WebView message bridge、真实 UXP/Photoshop host API、origin/source validation、plugin scheme fs、modal、batchPlay、imaging、resource handle 等行为，写到 `test/cdp/cases/*.mjs`。

CDP case 必须通过 public WebView API 和 harness 注入的 `bridge` context，不导入 `src` 内部文件。

固定测试顺序：

```powershell
pnpm test:static
pnpm typecheck
pnpm test:contract
pnpm test
```

交付前必须运行：

```powershell
pnpm build
```

如果当前单元覆盖真实 UXP/WebView 行为，还必须运行：

```powershell
pnpm test:uxp
```

需要单个 CDP case 调试时使用：

```powershell
pnpm test:uxp -- --case <caseName>
```

调试 UXP 时只能使用本项目的 `@bubblydoo/uxp-cli` 命令：

```powershell
pnpm exec uxp-cli open-devtools --plugin-path ./test/uxp-plugin
pnpm exec uxp-cli create-cdp-url --plugin-path ./test/uxp-plugin
```

不要使用 `uxp open-devtools`。

所有必需测试失败都要修复后重跑。若必需测试因缺少 Photoshop/UXP 环境无法运行，当前单元不能算完成，也不要提交；向用户报告 blocked。

### 5. 加载 code-review skill 审查

实现和初轮测试通过后，必须加载 `code-review` skill，并按当前分支 diff 审查本单元改动，等价于：

```txt
/code-review branch
```

审查重点：

- 是否违反 runtime boundary。
- 是否把 WebView proxy 写成了本地 native object。
- 是否有 `src/webview` 到 `src/uxp` 的导入，或反向导入。
- 是否绕过 capability、安全、origin、resource lifecycle、modal、错误语义。
- 是否偏离 `uxp-document/` 的 API 形状。
- 是否缺少必要的 contract 或 CDP 覆盖。

修复所有 critical 问题。变更较大或修复了关键问题后，重新加载/运行 `code-review`，直到没有 critical 问题并且 AI 判断可交付。

每一轮 review 修复后，都要重跑受影响测试；最终仍必须满足第 4 节的交付测试。

### 6. 加载 code-comiter skill 提交

只有在以下条件全部满足后，才能进入提交：

- 实现范围只包含当前单元。
- 必需测试全部通过。
- `pnpm build` 通过。
- `code-review` critical 问题清零。
- `git status` 中没有意外敏感文件或无关变更被纳入当前提交。

然后加载 `code-comiter` skill，通过：

```txt
/code-commit
```

提交规则由 `code-comiter` skill 执行：使用 Conventional Commit，精确 staging 文件，不使用 `git add -A` 或 `git add .`，不跳过 hooks，不 amend，不 push。

如果提交 hook 失败，先修复失败原因，重跑必要测试，再重新提交。不要用 `--no-verify`。

### 7. 单元交付报告

提交完成后，用简短报告结束当前单元：

```txt
Development unit complete

Module: <uxp-document module or slice>
Implementation: <changed runtime/shared areas>
Tests: <commands run and result>
Review: <code-review rounds and critical status>
Commit: <hash> <message>
Next: waiting for the next module
```

未完成时必须明确写 blocked 原因、已完成工作、未通过或未运行的 gate。不要把 blocked 单元报告成 complete。