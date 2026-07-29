# `PreferencesGeneral`

Writable remote fields:

- `colorPicker: { type, pluginId? }`
- `imageInterpolation`
- `exportClipboard`
- `autoUpdateOpenDocuments`
- `beepWhenDone`

Reads are async; writes queue. `colorPicker.type` is `photoshopPicker`, `systemPicker`, or `pluginPicker`; provide `pluginId` for a plugin picker.
