/**
 * A plugin exposed by the UXP plugin manager for IPC.
 * @see uxp-document/uxp-api/reference-js/modules/uxp/plugin-manager/plugin.md
 */
interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly manifest: unknown;
  readonly enabled: boolean;
  showPanel(panelId: string): Promise<void | string> | void | string;
  invokeCommand(commandId: string, ...params: readonly unknown[]): Promise<void> | void;
}

/**
 * Provides the current list of plugins in the host.
 * @see uxp-document/uxp-api/reference-js/modules/uxp/plugin-manager/plugin-manager.md
 */
interface PluginManager {
  readonly plugins: Set<Plugin>;
}

export const pluginManager: PluginManager;
