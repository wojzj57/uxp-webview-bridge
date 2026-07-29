# Package installation and bundling

The reviewed package is private and currently version `0.0.1`; it is not published to the public npm registry. This skill does not contain or install the package. Obtain the repository or a private package artifact from the library owner, then build the checked-out package with `pnpm install` and `pnpm build`, or add it inside a pnpm workspace:

```json
{
  "dependencies": {
    "uxp-webview-bridge": "workspace:*"
  }
}
```

`workspace:*` is valid only after the package is present in the same configured workspace. The public boundary is ESM and has three exports: root types, `/webview`, and `/uxp`. Bundle `/webview` into WebView code and `/uxp` into the UXP host bundle using a bundler compatible with the target UXP host. Never cause one runtime entrypoint to load the other.

Do not rely on unexported internal source paths. The supported runtime surface is the package subpath exports documented in this skill.
