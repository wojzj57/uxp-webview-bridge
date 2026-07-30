import type {
  UxpHostPlugin,
  UxpPluginManagerHostModule,
  UxpPluginManagerMethodName,
  UxpSerializedPlugin
} from "./types.js";

declare const require: (moduleName: "uxp") => UxpPluginManagerHostModule;

export interface UxpPluginManagerState {
  readonly pluginsById: Map<string, UxpHostPlugin>;
}

export function createUxpPluginManagerState(): UxpPluginManagerState {
  return { pluginsById: new Map() };
}

const defaultState = createUxpPluginManagerState();

export function dispatchUxpPluginManagerCall(
  method: UxpPluginManagerMethodName,
  args: readonly unknown[],
  state: UxpPluginManagerState = defaultState
): unknown {
  switch (method) {
    case "pluginManager.plugins":
      return dispatchPlugins(args, state);
    case "plugin.showPanel":
      return dispatchShowPanel(args, state);
    case "plugin.invokeCommand":
      return dispatchInvokeCommand(args, state);
    default:
      return assertNever(method);
  }
}

function dispatchPlugins(args: readonly unknown[], state: UxpPluginManagerState): UxpSerializedPlugin[] {
  if (args.length > 0) {
    throw new Error("uxp.pluginManager.plugins does not accept arguments.");
  }

  const plugins = Array.from(require("uxp").pluginManager.plugins);
  state.pluginsById.clear();
  return plugins.map((plugin) => serializePlugin(plugin, state));
}

function dispatchShowPanel(args: readonly unknown[], state: UxpPluginManagerState): Promise<void | string> | void | string {
  const [pluginId, panelId] = expectArgs<[string, string]>(args, 2, 2, "uxp.plugin.showPanel");
  assertNonEmptyString(pluginId, "uxp.plugin.showPanel pluginId");
  assertNonEmptyString(panelId, "uxp.plugin.showPanel panelId");

  return getPlugin(pluginId, state).showPanel(panelId);
}

function dispatchInvokeCommand(args: readonly unknown[], state: UxpPluginManagerState): Promise<void> | void {
  const [pluginId, commandId, ...params] = expectArgs<[string, string, ...unknown[]]>(
    args,
    2,
    Number.POSITIVE_INFINITY,
    "uxp.plugin.invokeCommand"
  );
  assertNonEmptyString(pluginId, "uxp.plugin.invokeCommand pluginId");
  assertNonEmptyString(commandId, "uxp.plugin.invokeCommand commandId");

  return getPlugin(pluginId, state).invokeCommand(commandId, ...params);
}

function serializePlugin(plugin: UxpHostPlugin, state: UxpPluginManagerState): UxpSerializedPlugin {
  assertNonEmptyString(plugin.id, "uxp.pluginManager plugin id");
  state.pluginsById.set(plugin.id, plugin);

  return {
    kind: "uxp.pluginManager.plugin",
    id: plugin.id,
    version: plugin.version,
    name: plugin.name,
    manifest: plugin.manifest,
    enabled: plugin.enabled
  };
}

function getPlugin(pluginId: string, state: UxpPluginManagerState): UxpHostPlugin {
  const plugin = state.pluginsById.get(pluginId);
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
  throw new Error(`Unsupported uxp pluginManager method: ${String(method)}`);
}
