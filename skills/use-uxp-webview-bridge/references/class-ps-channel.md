# `PsChannel`

Remote Photoshop channel. Writable queued properties: `name`, `opacity`, `visible`, `kind`, `color`. Read-only: `histogram`, `parent` document.

Methods: `duplicate(targetDocument?)`, `merge`, `remove`, `batchGet`, `batchSet`, `dispose`.

`histogram` is available only in valid visible-channel states. `color` reads as `PsSolidColor` and accepts a `SolidColorInput`. Channels have no stable native id, so proxies may not preserve `===` across collection snapshots.
