# `XMPUtils`

Use the singleton `uxp.xmp.XMPUtils`; it is not a constructed remote object.

Methods: `appendProperties`, `catenateArrayItems`, `composeArrayItemPath`, `composeFieldSelector`, `composeLangSelector`, `composeStructFieldPath`, `composeQualifierPath`, `duplicateSubtree`, `removeProperties`, and `separateArrayItems`.

All calls are asynchronous. Methods taking XMP objects require live bridge `XMPMeta` instances from the same configured runtime.
