# Fixture Diagnostics Stay Out of Public API

The UXP CDP fixture may expose test-only diagnostics under a `__UXP_BRIDGE_TEST_` prefix, but those diagnostics stay inside `test/uxp-plugin` and never become package API or source-runtime branches. Diagnostics can report host-side facts such as origins, resource counts, modal observations, or envelopes, while product observability must be designed separately.
