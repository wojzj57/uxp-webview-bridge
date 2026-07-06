# Test Scripts Separate Fast and UXP Gates

Top-level test scripts separate fast local gates from the real UXP/CDP gate. `pnpm test` runs static checks, type checking, and contract tests without requiring Photoshop or UXP automation; `pnpm test:uxp` builds the package and then runs CDP; `test:cdp` stays a direct runner entrypoint for debugging without forcing a rebuild on every case.
