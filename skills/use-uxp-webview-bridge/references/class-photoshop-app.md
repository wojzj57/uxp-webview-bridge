# `PhotoshopApp` (`Photoshop`)

The stable root remote object exposed as `photoshop.app`; `Photoshop` is the exact Adobe class-name type and `PhotoshopApp` is its compatibility name.

It supports async remote properties, queued setters, `batchGet`, and `batchSet`. It owns document/font/action-tree snapshots, app colors/dialog state/current tool, preferences, document open/create, UI helpers, and a compatibility `batchPlay` method. See [the app module reference](module-photoshop-app.md) for the member list.

Do not construct or dispose it. There is one app instance per configured bridge runtime.
