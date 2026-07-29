# `uxp.userInfo` module

Capability: `userInfo` (default enabled). The UXP manifest must enable user information.

`userId(): Promise<string>` returns the host-provided user identifier. Treat the identifier as sensitive application data and do not log or transmit it without product authorization.
