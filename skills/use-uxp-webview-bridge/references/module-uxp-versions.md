# `uxp.versions` module

Always registered. Read-only asynchronous properties:

- `uxp`: UXP runtime version
- `plugin`: current plugin version

Use `await uxp.versions.uxp` and `await uxp.versions.plugin`; do not treat them as synchronous strings.
