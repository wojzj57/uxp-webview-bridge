# Static Gate Is an Explicit Script

The static test gate is an explicit repository script instead of an informal checklist. It checks runtime boundary imports, public entrypoint exports, deprecated setup API absence, and symmetric module directories, while TypeScript type checking remains a separate gate through `pnpm typecheck`.
