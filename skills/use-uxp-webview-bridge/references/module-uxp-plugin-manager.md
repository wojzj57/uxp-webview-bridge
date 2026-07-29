# `uxp.pluginManager` module

Capability: `pluginManager` (default enabled).

`plugins` is an asynchronous snapshot array. Each `UxpPlugin` has `id`, `version`, `name`, `manifest`, `enabled`, plus:

- `showPanel(panelId): Promise<void | string>`
- `invokeCommand(commandId, ...params): Promise<void>`

Re-read `await uxp.pluginManager.plugins` to refresh plugin state.

Related: [UxpPlugin](class-uxp-plugin.md).
