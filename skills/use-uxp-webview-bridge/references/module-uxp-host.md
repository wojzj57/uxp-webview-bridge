# `uxp.host` module

Always registered. Read-only asynchronous properties:

- `name`
- `version`
- `uiLocale`

```ts
const host = {
  name: await uxp.host.name,
  version: await uxp.host.version,
  locale: await uxp.host.uiLocale
};
```
