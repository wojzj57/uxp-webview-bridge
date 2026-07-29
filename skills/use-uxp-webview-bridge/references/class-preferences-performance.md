# `PreferencesPerformance`

Writable remote numeric fields: `imageCacheLevels`, `maxRAMuse`.

Reads are async; writes queue. These affect host-wide resource use. Validate ranges against the target Photoshop host and change only with explicit product/user intent.
