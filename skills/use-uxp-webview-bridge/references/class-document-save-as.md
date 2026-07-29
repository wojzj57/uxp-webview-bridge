# `DocumentSaveAs`

Helper available as `document.saveAs`. Methods: `bmp`, `gif`, `jpg`, `png`, `psb`, and `psd`.

Each method takes a `UxpStorageFile`, optional format-specific save options, and optional `asCopy`. JPEG options include quality/format/scans/matte/profile; PNG includes method/compression/interlace; Photoshop formats include layers/profile/compatibility; GIF and BMP expose their corresponding palette/depth options.

```ts
const target = await uxp.storage.localFileSystem.getFileForSaving("result.png");
if (target) await document.saveAs.png(target, { compression: 6 }, true);
```

Do not pass raw paths. Dispose the file entry after the workflow no longer needs it.
