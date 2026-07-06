import type { pluginManager as nativePluginManager } from "@shared/types/uxp/internal/plugin-manager.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

type PluginSet = typeof nativePluginManager.plugins;
export type UxpHostPlugin = PluginSet extends Set<infer TPlugin> ? TPlugin : never;

export interface UxpPluginManagerHostModule {
  readonly pluginManager: typeof nativePluginManager;
}

export interface UxpSerializedPlugin {
  readonly kind: "uxp.pluginManager.plugin";
  readonly id: UxpHostPlugin["id"];
  readonly version: UxpHostPlugin["version"];
  readonly name: UxpHostPlugin["name"];
  readonly manifest: UxpHostPlugin["manifest"];
  readonly enabled: UxpHostPlugin["enabled"];
}

export type UxpPluginManagerMethodName = Extract<
  UxpProtocolMethodName,
  `pluginManager.${string}` | `plugin.${string}`
>;
