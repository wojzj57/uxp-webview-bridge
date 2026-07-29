## Commit Messages

Follow Conventional Commits:

- `feat: add new feature`
- `fix: fix bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: refactor code`
- `chore: update dependencies`

All commits should include DCO sign-off:

```text
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add sign-off automatically.

## Local Checks

Run the same checks required by CI before opening a pull request:

```sh
pnpm lint
pnpm test
pnpm build
```

The real UXP/Photoshop test suite is not part of the hosted CI gate. Run `pnpm test:uxp` only in an environment with the required Adobe host tooling.

## Changesets And Releases

Add a changeset to a pull request when its user-visible changes should be included in an npm release:

```sh
pnpm changeset
```

Documentation, tests, CI maintenance, and internal refactors do not require a changeset unless they affect the published package. After changesets reach `main`, the release workflow creates or updates the `chore: release` pull request. Merging that pull request publishes the package to npm and creates a Git tag and GitHub Release using the bare version number, such as `0.0.2`.
