/**
 * UXP plugin manager APIs used by uxp-webview-bridge.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly manifest: unknown;
  readonly enabled: boolean;
  showPanel(panelId: string): Promise<void | string> | void | string;
  invokeCommand(commandId: string, ...params: readonly unknown[]): Promise<void> | void;
}

export interface PluginManager {
  readonly plugins: Set<Plugin>;
}

export const pluginManager: PluginManager;
