# `XMPDateTime`

Construct with `new uxp.xmp.XMPDateTime(dateOrIsoString?)`.

Writable asynchronous fields: `year`, `month`, `day`, `hour`, `minute`, `second`, `nanosecond`, `tzSign`, `tzHour`, `tzMinute`. Setter assignments queue; use `batchSet` for explicit completion.

Methods: `compareTo`, `convertToLocalTime`, `convertToUTCTime`, `getDate`, `setLocalTimeZone`, `hasDate`, `hasTime`, `hasTimeZone`, `toString`, `batchGet`, `batchSet`, `dispose`.

Pass `XMPDateTime`, not an arbitrary object, to date-valued XMP property methods.
