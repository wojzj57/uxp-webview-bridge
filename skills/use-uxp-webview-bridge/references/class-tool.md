# `Tool`

Remote current-tool object from `photoshop.app.currentTool`.

Properties: writable queued `id`, read-only `typename`. Supports `batchGet` and `batchSet`.

```ts
const tool = await photoshop.app.currentTool;
await tool.batchSet({ id: "paintbrushTool" });
```

Tool ids are Photoshop string ids; availability depends on host version and state.
