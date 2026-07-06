# Contract Gate Uses Node Test

The first contract test gate uses Node's built-in `node:test` and `node:assert/strict` instead of adding a test framework dependency. The expected coverage is protocol behavior, capabilities, registry dispatch, mock postMessage flows, and error mapping; a heavier framework can be revisited if snapshots, complex mocking, coverage, or concurrency controls become necessary.
