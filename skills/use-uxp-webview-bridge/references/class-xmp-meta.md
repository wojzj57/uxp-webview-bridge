# `XMPMeta`

Construct with `new uxp.xmp.XMPMeta(packet?, buffer?)`. Static namespace methods: `registerNamespace`, `deleteNamespace`, `dumpNamespaces`, `getNamespacePrefix`, `getNamespaceURI`.

Property families:

- Read/existence: `getProperty`, `doesPropertyExist`, `getArrayItem`, `countArrayItems`, `doesArrayItemExist`, `getStructField`, `doesStructFieldExist`, `getQualifier`, `doesQualifierExist`, `getLocalizedText`.
- Write: `setProperty`, `appendArrayItem`, `insertArrayItem`, `setArrayItem`, `setStructField`, `setQualifier`, `setLocalizedText`.
- Delete: `deleteProperty`, `deleteArrayItem`, `deleteStructField`, `deleteQualifier`.
- Other: `iterator`, `sort`, `dumpObject`, `serialize`, `serializeToArray`, `dispose`.

XMP values are string/number/boolean or `XMPDateTime`. Property getters return `XMPProperty | null`. Namespace/property arguments follow Adobe XMP conventions. Always dispose metadata and any iterator it creates.
