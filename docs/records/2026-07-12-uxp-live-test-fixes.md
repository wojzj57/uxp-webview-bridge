# UXP 实机测试失败修复记录

日期：2026-07-12  
环境：Windows、Photoshop 26.10.0、UXP 9.0.1  
原始结果：32 passed、8 failed、3 skipped  
最终结果：40 passed、0 failed、3 skipped

## 修复范围

本次处理以下失败：

- `fs.file-descriptor-binary-roundtrip`
- `photoshop.batchplay-roundtrip`
- `photoshop.channel-read-write`
- `photoshop.channel-color-solidcolor`
- `photoshop.imaging.getpixels`
- `photoshop.imaging.roundtrip`
- `photoshop.imaging.encode-base64`
- `photoshop.imaging.dispose`

同时修复了业务错误消失后暴露出的 CDP runner `Promise was collected` 问题。

## 诊断过程

以 `pnpm test:uxp` 作为原始反馈环，稳定复现 8 个失败。随后用 `pnpm test:uxp -- --case <case-name> --verbose` 缩小到单 case，并在 UXP host 边界加入带 `[DEBUG-uxp-audit]` 前缀的临时探针。探针在根因确认后全部删除。

### 1. UXP classic bundle 符号碰撞

症状：`fs.file-descriptor-binary-roundtrip` 报 `Cannot read properties of undefined (reading 'length')`。

根因：`test/runner/prepare-uxp-fixture.mjs` 原先通过正则删除 ESM import/export，再把所有模块直接拼接到同一个 IIFE 作用域。多个模块包含同名顶层函数，例如：

- `dispatchRead`
- `expectArgs`
- `executeAsModal`
- `readString`
- `decodeValue`
- `toUint8Array`

后加载的 imaging `dispatchRead(method, apiMethod, args)` 覆盖了 fs `dispatchRead(args)`。fs registry 仍调用全局 `dispatchRead(args)`，实际进入 imaging 函数，导致其第三个参数 `args` 为 `undefined` 并读取 `args.length`。

修复：

- 将测试夹具 UXP bundle 改为 esbuild `iife` bundle，由 bundler 保持模块作用域和依赖绑定。
- 新增 `esbuild` dev dependency，并在 `pnpm-workspace.yaml` 允许其安装脚本。
- 更新 classic bundle contract test 名称以反映新的构建方式。

验证：生成的 `uxp-global.js` 不再包含重复顶层声明；fs 文件描述符 read/write 实机往返通过。

### 2. batchPlay 可选参数跨通道语义

初始症状：host 报 `action.batchPlay options must be an object when provided.`。

根因分两层：

1. WebView 发送 `[commands, undefined]`，UXP 消息通道把数组中的 `undefined` 表现为 `null`，host 因而认为提供了错误类型的 options。
2. WebView 改为省略第二项后，Photoshop 26.10 native binding 又报 `Argument 2 is missing`。虽然 Adobe TypeScript 签名把 options 标为可选，实际 binding 要求第二个实参必须是对象。

修复：

- WebView 在 options 未提供时只发送 `[commands]`。
- UXP host 将缺省 options 归一化为 `{}` 后调用 native `action.batchPlay(commands, {})`。
- 增加 host contract test，锁定该 native arity 兼容行为。
- CDP 写入用 Photoshop Action Manager 原生 `show`/`hide` 描述符替代无效的 `set { visible }` 描述符。

验证：实机 read descriptor 返回的 `layerID` 与代理 `layer.id` 一致；使用同一 native id 隐藏并恢复图层成功。

### 3. Channel 测试错误选择 component channel

症状：opacity/color 测试报“操作对于类型组件的通道无效”。

根因：测试总是取 `document.channels[0]`，在 RGB 文档中通常是 component channel。Photoshop 不允许在 component channel 上执行 alpha-channel 专属的 opacity/color 修改。

修复：

- 补齐 RFC-0011 已声明但 host 尚未实现的 `Channels.add()`。
- WebView `Channels` 类型和 snapshot capability 注册 `add`。
- `channel-read-write` 与 `channel-color-solidcolor` 各自创建临时 alpha channel，在 `finally` 中调用 `remove()` 清理。
- color case 在读取 histogram 前确保临时 channel 可见。

验证：临时 channel 类型为 `maskedAreas`，opacity read-your-writes、SolidColor 五种视图、color 写回及 256 项 histogram 均实机通过。

### 4. PhotoshopImageData 是 function-shaped host object

症状：4 个 imaging case 都报 `Expected a PhotoshopImageData metadata object.`。

定点探针结果：

```text
typeof imageData === "function"
constructor === "Function"
width === 3840
```

根因：Photoshop 26.10 将 `PhotoshopImageData` 暴露为可调用的宿主对象；它的 `typeof` 是 `function`，但 metadata 属性和方法正常存在。metadata serializer 只接受 `typeof === "object"`。

修复：metadata 读取接受非空 object 或 function。contract test 使用 `Object.assign(function PhotoshopImageData() {}, metadata)` 精确锁定该运行时形状。

验证：

- `getPixels` 返回 3840×2160、8-bit、33,177,600 bytes；typed array 正确。
- create/getData 小缓冲 round-trip 通过。
- dispose 后 getData 正确拒绝。
- RGB（无 alpha）imageData JPEG/base64 编码通过。

### 5. CDP runner 的 `Promise was collected`

症状：修复 metadata 后，长时间 imaging case 运行期间，`Runtime.evaluate` 轮询 `window.__UXP_BRIDGE_TEST_RESULT__` 偶发/持续返回 `Promise was collected`。

根因：UXP DevTools 在 Photoshop imaging promise 活跃时，可能错误地把同步的 result polling evaluation 与已回收 Promise 关联。runner 原先把该 CDP protocol error 视为致命错误。

修复：

- case 启动改为 fire-and-poll，不等待 case Promise。
- Runtime evaluation 使用同步模式。
- result 在 panel context 内先 `JSON.stringify`，CDP 只传字符串。
- polling 遇到特定的 `Promise was collected` 时按 250ms 间隔重试，其他错误仍立即抛出。
- CDP 错误现在包含 evaluation label，便于后续定位。

验证：33MB 的 imaging getPixels/getData case 和完整套件均能稳定完成并报告结果。

## 修改文件

主要修复文件：

- `test/runner/prepare-uxp-fixture.mjs`
- `test/runner/run-cdp-test.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `src/shared/photoshop-api/imaging-protocol.ts`
- `src/webview/photoshop-api/modules/photoshop/photoshop.ts`
- `src/webview/photoshop-api/modules/photoshop/registry.ts`
- `src/webview/photoshop-api/modules/photoshop/types.ts`
- `src/webview/photoshop-api/modules/photoshop/photoshop.test.ts`
- `src/uxp/photoshop-api/modules/photoshop/host.ts`
- `src/webview/photoshop-api/modules/imaging/imaging.test.ts`
- `test/contract/photoshop-batchplay.test.mjs`
- `test/contract/photoshop-imaging.test.mjs`
- `test/contract/uxp-classic-bundle.test.mjs`

## 最终验证

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过 |
| `pnpm exec tsc -p tsconfig.cdp-webview.json` | 通过 |
| `pnpm test:contract` | 123 passed、0 failed |
| `pnpm build` | 通过（contract 与 UXP 测试均重新执行） |
| `pnpm test:uxp` | 40 passed、0 failed、3 skipped |

跳过项：

- `clipboard.text-roundtrip`
- `uxp.shell-open-external`
- `uxp.shell-open-path`

这些 case 需要剪贴板或外部打开交互/权限，不属于原始失败集合。

## 防止复发

- UXP classic fixture 必须由真正的 module bundler 生成，禁止通过删除 import/export 后裸拼接模块。
- 所有跨桥可选数组参数必须省略尾部 `undefined`；host 对 native binding 的实际 arity 要用 contract test 固定。
- UXP host object 校验不能默认 `typeof === "object"`；Adobe proxy 可能是 function-shaped。
- 修改型 Channel case 必须使用临时 alpha channel，不得依赖文档第一个 component channel。
- 长耗时 Photoshop case 的 CDP runner 应启动后轮询，不直接持有 case Promise。
