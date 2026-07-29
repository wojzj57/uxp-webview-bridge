# `HistoryStates`

Read-only array-like snapshot from `await document.historyStates` with `parent` and `getByName(name) -> PsHistoryState | null`.

Re-read after edits or history suspension. Do not assume indexes remain stable after Photoshop changes history.
