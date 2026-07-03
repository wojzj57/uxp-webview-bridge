import type { UxpSerializedPlugin } from "../../../../shared/contracts/uxp.js";
import type { BridgeCapabilities } from "../../../../shared/types.js";
import { requireUxpSubmodule, type UxpHostPlugin } from "./host-module.js";
import { assertUxpCapability, assertUxpString, expectUxpArgs } from "./validation.js";

export async function dispatchPluginManagerCall(
  method: "pluginManager.plugins" | "plugin.showPanel" | "plugin.invokeCommand",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpCapability(capabilities, "pluginManager");

  switch (method) {
    case "pluginManager.plugins":
      expectUxpArgs(args, 0, 0, "uxp.pluginManager.plugins");
      return Array.from(requireUxpSubmodule("pluginManager").plugins, serializePlugin);

    case "plugin.showPanel": {
      const [pluginId, panelId] = expectUxpArgs<[string, string]>(
        args,
        2,
        2,
        "uxp.Plugin.showPanel"
      );
      assertUxpString(pluginId, "uxp.Plugin.showPanel plugin id");
      assertUxpString(panelId, "uxp.Plugin.showPanel panelId");
      const result = await findPlugin(pluginId).showPanel(panelId);
      return typeof result === "string" ? result : undefined;
    }

    case "plugin.invokeCommand": {
      const [pluginId, commandId, ...params] = expectUxpArgs<[string, string, ...unknown[]]>(
        args,
        2,
        Number.MAX_SAFE_INTEGER,
        "uxp.Plugin.invokeCommand"
      );
      assertUxpString(pluginId, "uxp.Plugin.invokeCommand plugin id");
      assertUxpString(commandId, "uxp.Plugin.invokeCommand commandId");
      await findPlugin(pluginId).invokeCommand(commandId, ...params);
      return undefined;
    }
  }
}

function serializePlugin(plugin: UxpHostPlugin): UxpSerializedPlugin {
  return {
    id: plugin.id,
    version: plugin.version,
    name: plugin.name,
    manifest: plugin.manifest,
    enabled: plugin.enabled
  };
}

function findPlugin(pluginId: string): UxpHostPlugin {
  for (const plugin of requireUxpSubmodule("pluginManager").plugins) {
    if (plugin.id === pluginId) {
      return plugin;
    }
  }

  throw new Error(`Unknown uxp plugin: ${pluginId}`);
}
