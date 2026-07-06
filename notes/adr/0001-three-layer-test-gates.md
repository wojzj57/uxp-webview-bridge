# Three-Layer Test Gates

The bridge uses three test gates: static checks for source boundaries and public exports, contract tests for protocol and adapter semantics under controlled mocks, and UXP CDP tests for behavior that depends on a real UXP plugin and WebView runtime. This keeps fast checks close to ordinary development while preserving CDP as the source of truth for cross-runtime behavior that mocks cannot prove.
