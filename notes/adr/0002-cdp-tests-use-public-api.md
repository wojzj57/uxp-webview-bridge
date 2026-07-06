# CDP Tests Use Public API

UXP CDP tests exercise the package through its published WebView and UXP subpath exports instead of importing internal runtime classes, adapters, or registries. Internal bridge mechanics belong in contract tests; CDP tests prove that the packaged public API works across the real UXP host and WebView boundary.
