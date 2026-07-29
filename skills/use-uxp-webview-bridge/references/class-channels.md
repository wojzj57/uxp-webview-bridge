# `Channels`

Read-only array-like snapshot owned by a document. Fields: `parent`, `typename: "Channels"`.

- `getByName(name) -> PsChannel | null`
- `add() -> PsChannel` creates an alpha channel.
- `removeAll()` removes host-removable channels.

Re-read `document.channels`, `componentChannels`, or `activeChannels` after mutations. Channel instances may not deduplicate across snapshots.
