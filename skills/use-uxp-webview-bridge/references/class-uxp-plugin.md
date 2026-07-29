# `UxpPlugin`

Snapshot object returned inside `await uxp.pluginManager.plugins`.

Synchronous snapshot fields: `kind`, `id`, `version`, `name`, `manifest`, `enabled`.

- `showPanel(panelId): Promise<void | string>`
- `invokeCommand(commandId, ...params): Promise<void>`

Re-read the plugin-manager collection to refresh enabled/version/manifest state. Command and panel ids come from the target plugin's manifest.
