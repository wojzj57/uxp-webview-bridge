# `uxp.xmp` module

Capability: `xmp` (default enabled).

Exposes `XMPMeta`, `XMPFile`, `XMPDateTime`, `XMPIterator`, `XMPUtils`, and the synchronous `XMPConst` table. Constructors create host-owned remote objects; static namespace methods are asynchronous.

```ts
const meta = new uxp.xmp.XMPMeta();
try {
  await meta.setProperty(ns, "dc:title", "Example");
  const packet = await meta.serialize();
} finally {
  await meta.dispose();
}
```

Dispose metadata, files, dates, and iterators. Pass `XMPDateTime` for date-valued properties; plain `Date` is accepted only by its constructor.

Related: [XMPMeta](class-xmp-meta.md), [XMPFile](class-xmp-file.md), [XMPDateTime](class-xmp-date-time.md), [XMPIterator](class-xmp-iterator.md), and [XMPUtils](class-xmp-utils.md).
