# `PreferencesFileHandling`

Writable remote fields:

- `imagePreviews`
- `useLowerCaseExtension`
- `askBeforeSavingLayeredTIFF`
- `maximizeCompatibility`
- `recentFileListMaximum`

Reads are async; writes queue. Use `batchSet` for grouped updates and appropriate Photoshop constants for enum-valued properties.
