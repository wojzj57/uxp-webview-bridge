# UXP clipboard 实机兼容修复记录

日期：2026-07-12  
环境：Windows、Photoshop 26.10.0、UXP 9.0.1  
开发单元：clipboard 文本写入/读取往返

## 症状

`test/uxp-plugin/manifest.json` 已声明：

```json
"clipboard": "readAndWrite"
```

但 `pnpm test:uxp -- --case clipboard.text-roundtrip --verbose` 报告为 `SKIP`，诊断信息是：

```text
clipboard.readText returned a non-string value.
```

## 根因

权限实际已经生效：`navigator.clipboard.writeText()` 成功写入。临时 host 边界探针确认 Photoshop 26.10 / UXP 9.0.1 的 `navigator.clipboard.readText()` 返回：

```json
{ "text/plain": "uxp-webview-bridge-..." }
```

而不是 Web 标准形态的字符串。原 host adapter 只接受字符串，因此在成功读取后主动抛错。CDP case 又捕获了所有异常并统一转换成“环境不支持”的跳过结果，掩盖了真实的兼容问题。

## 修复

- UXP host 的 `clipboard.readText` 同时接受标准字符串和 UXP MIME map。
- MIME map 只提取字符串类型的 `text/plain`；缺少纯文本时继续报协议错误。
- CDP case 不再捕获所有异常并跳过，真实权限、桥接和返回值错误现在会使测试失败。
- 增加 contract tests，覆盖 UXP MIME map 归一化与无 `text/plain` 的错误路径；原有测试继续覆盖标准字符串路径。

## Code review

使用 `code-review` 对本轮 diff 完成一轮审查。没有发现关键缺陷：归一化发生在 UXP host 边界，WebView 公共 `readText(): Promise<string>` 契约保持稳定，且错误不再被 CDP case 隐藏。

## 验证

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test:static` | 通过 |
| `pnpm test:contract` | 125 passed、0 failed |
| `pnpm test:uxp -- --case clipboard.text-roundtrip --verbose` | passed |
| `pnpm test:uxp -- --verbose` | 41 passed、0 failed、2 skipped |

剩余两个跳过项是 `uxp.shell-open-external` 与 `uxp.shell-open-path`，均涉及外部打开交互，与 clipboard 无关。
