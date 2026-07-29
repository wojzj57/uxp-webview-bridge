# Changesets

Changesets are the source of truth for package version updates and changelog entries.

Add one Markdown file for each user-visible change. Use a descriptive random filename and this format:

```md
---
"uxp-webview-bridge": patch
---

Fix forwarded fetch cancellation so aborting a request also cancels the UXP host operation.
```

While the package is below `1.0.0`, use:

- `patch` for backward-compatible fixes and features.
- `minor` for public API, bridge protocol, or runtime behavior changes that require consumers to migrate.
- No changeset for documentation, tests, or internal refactors with no user-visible effect.

Release notes must describe public behavior rather than repeat commit subjects. When a release contains several changes, group them using the repository's Conventional Commit order: Features, Fixes, Documentation, Tests, Refactors, and Maintenance. Put a Breaking Changes section first when migration is required.

Automation must use only non-interactive commands:

```powershell
node_modules/.bin/changeset.cmd --version
node_modules/.bin/changeset.cmd status
node_modules/.bin/changeset.cmd version
```

Do not run bare `changeset` or `pnpm changeset` in automation because they open an interactive package-selection prompt. Review every changeset before running `changeset version`. Publishing is a separate, explicitly authorized operation.
