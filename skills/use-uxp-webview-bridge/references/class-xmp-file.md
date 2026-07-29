# `XMPFile`

Construct with `new uxp.xmp.XMPFile(filePath?, format?, openFlags?)`. Static `XMPFile.getFormatInfo(format)` returns format flags.

Methods:

- `canPutXMP(metaOrPacket)`
- `getXMP() -> XMPMeta`
- `putXMP(metaOrPacket)`
- `getPacketInfo()`
- `getFileInfo()`
- `closeFile(closeFlags)`
- `dispose()`

Use `try/finally`. Close the file according to XMP semantics, then dispose the remote handle. Dispose metadata returned by `getXMP()` separately.
