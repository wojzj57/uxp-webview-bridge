# `PreferencesBase`

Generic public type shared by all remote preference categories. It provides async `typename`, typed `batchGet(propertyNames)`, and typed `batchSet(properties)`.

Do not construct it. Obtain a concrete category from `photoshop.preferences`, `photoshop.app.preferences`, or a direct `photoshop.preferencesXxx` property. Every category read is asynchronous and every ordinary setter assignment queues; use `batchSet` for explicit completion.
