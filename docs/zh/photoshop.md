[English](../photoshop.md)

# Photoshop 指南

[概览](./index.md) | [快速开始](./getting-started.md) | [安全与权限](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [转发 fetch](./fetch.md)

WebView 的 `photoshop` 命名空间导出已实现的 Photoshop DOM、Action、Core、Imaging、辅助函数和常量表接口。所有原生工作都在 UXP 宿主中执行。四个相互独立的叶子负责授权远程接口：

| 叶子能力 | 接口 |
| --- | --- |
| `photoshop.dom` | 三个公开 batchPlay 方法之外的 Photoshop 主适配器方法，包括 DOM 远程对象 |
| `photoshop.core` | `photoshop.core`，包括模态会话 Core RPC 方法 |
| `photoshop.imaging` | `photoshop.imaging` 和 image-data 句柄方法 |
| `photoshop.batchPlay` | `photoshop.action.batchPlay`、`photoshop.action.batchPlaySync` 和 `photoshop.app.batchPlay` |

四个叶子默认全部拒绝，启用其中一个不会启用其他叶子。`photoshop.all` 会展开为已安装包版本中已知的四个叶子，并可能在升级新增 Photoshop 叶子后扩大。同步常量和 WebView 本地构造器不会跨桥，因此不需要 capability。

完整的当前接口请查看 [`src/webview/photoshop-api`](../../src/webview/photoshop-api) 下导出的 TypeScript 类型。本指南介绍远程对象模型和安全的代表性流程，不会逐一重复所有 Adobe 成员。

## 安全读取活动文档

活动文档可能不可用。这个只读示例不会创建、修改或关闭用户的文档。

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const document = await photoshop.app.activeDocument.catch(() => null);

if (!document) {
  console.log("Open a document to inspect Photoshop state.");
} else {
  const layers = await document.layers;
  const firstLayer = layers[0];
  console.log({
    documentName: await document.name,
    layerCount: layers.length,
    firstLayerName: firstLayer ? await firstLayer.name : undefined
  });
}
```

`document.layers` 返回一个时间点集合包装器。再次读取会生成另一个包装器，它不会自动刷新。如果存在稳定的 Photoshop 领域 id，跨快照表示同一活动对象的成员会保持稳定 identity。

## 理解值与远程对象

| 形式 | 语义 |
| --- | --- |
| 远程对象 | 表示实时宿主状态。属性读取是 Promise 值，方法会跨桥执行。 |
| 集合包装器 | WebView 本地的成员 id 快照；通过索引延迟解析成员。它不是实时集合。 |
| 值对象 | bounds 或 histogram 等纯序列化数据；没有远程生命周期或方法。 |
| 常量/辅助函数 | WebView 本地同步表或 builder，例如 `photoshop.constants`、颜色辅助函数或路径 builder。 |
| 资源句柄 | `PsImageData` 等临时宿主资源；应在 `finally` 中调用 `dispose()`。 |

远程失败表现为带远程元数据和 `operationId` 的 `BridgeRemoteError`。能力拒绝的 code 为 `ERR_BRIDGE_CAPABILITY_DISABLED`、远程 name 为 `BridgeCapabilityError`，并包含精确的 `capability`、`module` 和 `method` 字段。Action/batchPlay descriptor 是调用者所有的不透明 Photoshop JSON；其中的原生 id 是 Photoshop id，不是桥接 remote-reference id。

## 排队写入与模态执行

远程属性 setter 无法返回可等待的 Promise。写入会进入队列，下一次远程读取或方法调用会按顺序刷新之前的写入。以下示例创建可清理状态，并在不保存的情况下关闭：

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const testDocument = await photoshop.app.createDocument({
  name: "Bridge lifecycle example",
  width: 16,
  height: 16
});

if (!testDocument) {
  throw new Error("Photoshop did not create the test document.");
}

try {
  const layer = await testDocument.createLayer({ name: "Initial name" });
  if (layer) {
    await layer.batchSet({ name: "Updated name" });
    console.log(await layer.name);
  }
} finally {
  await testDocument.closeWithoutSaving();
}
```

`batchSet()` 会验证完整输入，在调用时创建快照，并返回一个在宿主完成写入后 resolve 的 Promise。需要明确完成状态时应使用它。直接属性赋值仍会将写入排队，并在下一次远程读取或方法调用前刷新。

当适配器将操作分类为修改性操作时，UXP 适配器会进入 Photoshop 模态执行接缝。WebView 调用者不应再增加一层 WebView 侧 `executeAsModal` 包装器。被适配器分类为非修改性的读取不会无谓进入模态执行。

## Imaging 句柄

产生像素的操作返回临时资源句柄 `PsImageData`。其元数据可以在本地读取，而 `getData()` 和 `dispose()` 会跨桥执行。即使读取或编码失败，也必须释放它。

```ts
import { photoshop } from "uxp-webview-bridge/webview";

const document = await photoshop.app.activeDocument.catch(() => null);
if (document) {
  const { imageData } = await photoshop.imaging.getPixels({
    documentID: await document.id
  });

  try {
    const pixels = await imageData.getData({ chunky: true });
    console.log({ width: imageData.width, height: imageData.height, values: pixels.length });
  } finally {
    await imageData.dispose();
  }
}
```

不要把图像句柄一直保留到宿主超时清理。句柄释放后，再调用 `getData()` 会被拒绝。

## 接口说明

- `photoshop.app`、`photoshop.action`、`photoshop.core` 和 `photoshop.imaging` 是直接命名空间族。
- `photoshop.constants` 和导出的辅助函数是同步的，不会跨桥。
- 纯值对象是快照，不是实时远程对象。
- 如果 Photoshop 状态在生成快照后改变，集合成员可能失效。
- 一次需要多个远程属性时使用 `batchGet`；需要明确宿主完成状态的成组写入应 `await batchSet`。
- 修改性示例必须拥有可清理的测试状态。绝不能把用户当前文档当作临时状态。
- 即使宿主也有超时清理，Imaging 资源仍需要确定性释放。
