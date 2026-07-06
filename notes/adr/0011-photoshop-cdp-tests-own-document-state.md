# Photoshop CDP Tests Own Document State

Photoshop CDP suites create and clean up their own test documents instead of relying on the user's current Photoshop state. Suite manifests declare document prerequisites, setup creates minimal documents or layers, teardown closes test documents without saving, and unsupported host capabilities are reported as skipped with diagnostics rather than as false failures.
