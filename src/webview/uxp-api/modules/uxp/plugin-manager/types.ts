import type { Plugin as NativePlugin } from "@shared/types/uxp/internal/plugin-manager.js";

export interface UxpSerializedPlugin {
  readonly kind: "uxp.pluginManager.plugin";
  readonly id: NativePlugin["id"];
  readonly version: NativePlugin["version"];
  readonly name: NativePlugin["name"];
  readonly manifest: NativePlugin["manifest"];
  readonly enabled: NativePlugin["enabled"];
}

export interface UxpPlugin extends UxpSerializedPlugin {
  showPanel(panelId: string): Promise<void | string>;
  invokeCommand(commandId: string, ...params: readonly unknown[]): Promise<void>;
}

export interface UxpPluginManager {
  readonly plugins: Promise<readonly UxpPlugin[]>;
}
