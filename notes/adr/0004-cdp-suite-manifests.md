# CDP Suite Manifests

CDP tests are organized by suite manifests while still allowing a single case to be run directly. Suites define case ordering, timeouts, and fixture prerequisites such as Photoshop document state, so the runner does not become the place where smoke, filesystem, Photoshop, and imaging coverage is hard-coded.
