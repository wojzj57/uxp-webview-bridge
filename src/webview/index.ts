export { os } from "./uxp-api/modules/os/os.js";
export type { CpuInfo, OsNamespace } from "./uxp-api/modules/os/index.js";
export { configWebviewBridge } from "./runtime.js";
export type { BridgeClientRuntime, ConfigWebviewBridgeOptions } from "./runtime.js";
export { fs } from "./uxp-api/modules/fs/index.js";
export type { FsNamespace, RemoteFileHandle } from "./uxp-api/modules/fs/index.js";
export { photoshop } from "./uxp-api/modules/photoshop/index.js";
export type {
  Action,
  App,
  Core,
  Document,
  Documents,
  Imaging,
  Layer,
  Layers,
  PhotoshopNamespace
} from "./uxp-api/modules/photoshop/index.js";
export { uxp } from "./uxp-api/modules/uxp/index.js";
export type { UxpNamespace } from "./uxp-api/modules/uxp/index.js";
