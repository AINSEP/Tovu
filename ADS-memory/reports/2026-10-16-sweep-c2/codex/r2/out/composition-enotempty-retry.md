Programmer(Execution): Programmer persona selected for lifecycle tracing and the smallest teardown change.

CHANGED FILES:

- [composition-served-site-dir.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts:109) — replaced describe-level `rmSync` with awaited `removeFrozenPackageTree`. Preserved store shutdown, existing comments, and environment restoration in `finally`.

ROOT CAUSE:

The exact failed directory still contains the fixture’s GitHub package, with directories `0555` and files `0444`. Installation freezes these permissions at [install.js:407](/Users/la/Programming/Tovu/node_modules/@jini-ai/agent-plugins/dist/lifecycle/install.js:407), preventing ordinary recursive deletion. This evidence points to permissions; no continuing writer was identified.

Reused Jini’s existing [removeFrozenPackageTree](/Users/la/Programming/Tovu/node_modules/@jini-ai/agent-plugins/dist/lifecycle/uninstall.js:341), which restores permissions before removal. No retries or production changes added.

NOT DONE:

Tests, typecheck, builds, and package scripts were not run, as instructed. Runtime success remains unverified. `git diff --check` passed; git state was not modified.
