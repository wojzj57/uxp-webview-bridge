# CDP Runner Consumes Explicit URL

The CDP runner consumes `UXP_CDP_URL` or an explicit `--cdp-url` argument instead of launching Photoshop, opening DevTools, or discovering the URL itself. `pnpm uxp:cdp-url` remains the separate helper for `uxp-cli create-cdp-url --plugin-path ./test/uxp-plugin`, keeping runner failures focused on test execution rather than environment orchestration.
