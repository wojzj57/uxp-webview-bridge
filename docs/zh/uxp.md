[English](../uxp.md)

# UXP 命名空间指南

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

配置桥接后，从 WebView 入口导入 `uxp`。调用会在插件宿主中对真实 UXP API 执行；原生 UXP 中同步的属性在跨桥后通常是 Promise 值。

## 命名空间映射与前置条件

| 功能族 | 代表接口 | 实际桥接能力 | 常见清单关注点 |
| --- | --- | --- | --- |
| `uxp.host` | name、version、UI locale | 除 UXP 模块分发外无额外能力 | 此仓库未发现额外要求 |
| `uxp.versions` | UXP 和插件版本 | 除 UXP 模块分发外无额外能力 | 此仓库未发现额外要求 |
| `uxp.pluginManager` | 已安装插件快照和命令 | `pluginManager` | 宿主/插件策略 |
| `uxp.shell` | `openExternal`、`openPath` | `shell` | `requiredPermissions.launchProcess` |
| `uxp.storage.secureStorage` | 秘密字节值 | `keyValueStorage` | 应作为秘密存储边界 |
| `uxp.storage.localFileSystem` | 文件、文件夹、token、picker | `persistentFileStorage` | 按需使用 `requiredPermissions.localFileSystem` |
| `uxp.userInfo` | 用户 id | `userInfo` | `requiredPermissions.enableUserInfo` |
| `uxp.xmp` | XMP 构造器、常量、元数据方法 | `xmp` | 可用性取决于宿主 API |

完整的已实现接口请查看 [`src/webview/uxp-api/modules/uxp`](../../src/webview/uxp-api/modules/uxp) 下导出的 TypeScript 类型。

## Promise 属性

始终对 `uxp.host.name`、`uxp.host.version`、`uxp.versions.uxp`、`uxp.versions.plugin`、`uxp.pluginManager.plugins` 和 `uxp.storage.secureStorage.length` 等远程属性使用 await。

```ts
import { uxp } from "uxp-webview-bridge/webview";

const [hostName, hostVersion, uxpVersion, pluginVersion, plugins] = await Promise.all([
  uxp.host.name,
  uxp.host.version,
  uxp.versions.uxp,
  uxp.versions.plugin,
  uxp.pluginManager.plugins
]);

console.log({ hostName, hostVersion, uxpVersion, pluginVersion, pluginCount: plugins.length });
```

## Shell URL

当目标清单的启动策略允许时，`uxp.shell.openExternal` 接受 HTTPS URL。WebView 适配器会在本地拒绝该方法的 `file:` URL；对经过评审的本地路径应使用独立的 `openPath` 流程。

```ts
import { uxp } from "uxp-webview-bridge/webview";

await uxp.shell.openExternal(
  new URL("https://example.com/help"),
  "Open product help"
);
```

不要在缺少应用层验证时用不受信任的文本构造启动目标。

## 临时文件生命周期

存储条目是远程资源代理。请清理测试文件，并释放文件和文件夹代理。清单权限要求取决于所选 provider/操作及目标宿主。

```ts
import { uxp } from "uxp-webview-bridge/webview";

const folder = await uxp.storage.localFileSystem.getTemporaryFolder();
let file;

try {
  file = await folder.createFile(`bridge-${Date.now()}.txt`, { overwrite: false });
  await file.write("hello", { format: uxp.storage.formats.utf8 });
  console.log(await file.read({ format: uxp.storage.formats.utf8 }));
} finally {
  if (file) {
    try {
      await file.delete();
    } catch {
      // Best-effort cleanup.
    }
    try {
      await file.dispose();
    } catch {
      // Best-effort cleanup.
    }
  }
  try {
    await folder.dispose();
  } catch {
    // Best-effort cleanup.
  }
}
```

即使底层文件系统条目是持久化的，持久文件/文件夹代理本身仍是资源句柄。使用完毕后释放代理；删除底层文件是另一个独立操作。

## 安全存储

安全存储读写字节。请使用带命名空间的键，不要记录值，并删除临时/测试数据。

```ts
import { uxp } from "uxp-webview-bridge/webview";

const key = "com.example.plugin/session-token";

try {
  await uxp.storage.secureStorage.setItem(key, new TextEncoder().encode("temporary-secret"));
  const secretBytes = await uxp.storage.secureStorage.getItem(key);
  console.log(`Loaded ${secretBytes.byteLength} secret bytes`);
} finally {
  await uxp.storage.secureStorage.removeItem(key);
}
```

不要把凭据放入 URL、日志、local storage 或 session storage。

## XMP 资源生命周期

XMP 构造器返回远程句柄。在本地使用同步常量表、等待远程方法，并在 `finally` 中释放句柄。

```ts
import { uxp } from "uxp-webview-bridge/webview";

const { XMPConst, XMPMeta } = uxp.xmp;
const namespace = XMPConst.NS_XMP;
if (typeof namespace !== "string" || namespace.length === 0) {
  throw new Error("The XMP namespace is unavailable.");
}

const meta = new XMPMeta();

try {
  await meta.setProperty(namespace, "CreatorTool", "uxp-webview-bridge");
  const property = await meta.getProperty(namespace, "CreatorTool");
  console.log(property?.value);
} finally {
  await meta.dispose();
}
```

公共类型中标明可释放的 `XMPMeta`、`XMPFile`、`XMPIterator` 和 `XMPDateTime` 值必须释放。持久领域引用与临时资源句柄不能互换；请遵循导出类型的清理契约。

## 错误处理

远程 UXP 失败会表现为带远程元数据和 `operationId` 的 `BridgeRemoteError`。能力失败表示桥接分发策略问题；原生权限失败表示清单/宿主边界问题。应分别处理，不能为了消除错误而同时扩大两种控制。
