import type {
  UxpHostPlugin,
  UxpPluginManagerHostModule,
  UxpPluginManagerMethodName,
  UxpSerializedPlugin
} from "./types.js";

declare const require: (moduleName: "uxp") => UxpPluginManagerHostModule;

const PLUGINS_BY_ID = new Map<string, UxpHostPlugin>();

export function dispatchUxpPluginManagerCall(
  method: UxpPluginManagerMethodName,
  args: readonly unknown[]
): unknown {
  switch (method) {
    case "pluginManager.plugins":
      return dispatchPlugins(args);
    case "plugin.showPanel":
      return dispatchShowPanel(args);
    case "plugin.invokeCommand":
      return dispatchInvokeCommand(args);
    default:
      return assertNever(method);
  }
}

function dispatchPlugins(args: readonly unknown[]): UxpSerializedPlugin[] {
  if (args.length > 0) {
    throw new Error("uxp.pluginManager.plugins does not accept arguments.");
  }

  const plugins = Array.from(require("uxp").pluginManager.plugins);
  PLUGINS_BY_ID.clear();
  return plugins.map(serializePlugin);
}

function dispatchShowPanel(args: readonly unknown[]): Promise<void | string> | void | string {
  const [pluginId, panelId] = expectArgs<[string, string]>(args, 2, 2, "uxp.plugin.showPanel");
  assertNonEmptyString(pluginId, "uxp.plugin.showPanel pluginId");
  assertNonEmptyString(panelId, "uxp.plugin.showPanel panelId");

  return getPlugin(pluginId).showPanel(panelId);
}

function dispatchInvokeCommand(args: readonly unknown[]): Promise<void> | void {
  const [pluginId, commandId, ...params] = expectArgs<[string, string, ...unknown[]]>(
    args,
    2,
    Number.POSITIVE_INFINITY,
    "uxp.plugin.invokeCommand"
  );
  assertNonEmptyString(pluginId, "uxp.plugin.invokeCommand pluginId");
  assertNonEmptyString(commandId, "uxp.plugin.invokeCommand commandId");

  return getPlugin(pluginId).invokeCommand(commandId, ...params);
}

function serializePlugin(plugin: UxpHostPlugin): UxpSerializedPlugin {
  assertNonEmptyString(plugin.id, "uxp.pluginManager plugin id");
  PLUGINS_BY_ID.set(plugin.id, plugin);

  return {
    kind: "uxp.pluginManager.plugin",
    id: plugin.id,
    version: plugin.version,
    name: plugin.name,
    manifest: plugin.manifest,
    enabled: plugin.enabled
  };
}

function getPlugin(pluginId: string): UxpHostPlugin {
  const plugin = PLUGINS_BY_ID.get(pluginId);
  if (!plugin) {
    throw new Error(`Unknown uxp.pluginManager plugin id: ${pluginId}`);
  }

  return plugin;
}

function expectArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNever(method: never): never {
  throw new Error(`Unsupported uxp pluginManager method: ${method}`);
}
