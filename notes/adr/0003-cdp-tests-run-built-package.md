# CDP Tests Run the Built Package

UXP CDP tests must run after `pnpm build` and the fixture plugin must consume the built package output, not TypeScript source or private internal paths. The CDP gate exists to validate the published subpath exports and real UXP/WebView runtime behavior, while source-level coverage belongs to static and contract tests.
