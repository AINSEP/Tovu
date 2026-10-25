Programmer(Execution): Chosen for desktop CLI/IPC integration. S3 is implemented.

Changed files:

- [owner-store-cli.ts](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/desktop/src/owner-store-cli.ts): bounded CLI spawning, stdin-only secrets, fixed error messages.
- [owner-store-ipc.ts](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/desktop/src/owner-store-ipc.ts): trusted main-frame IPC, tracked-site resolution, serialized sync.
- [owner-store contract](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/desktop/src/contracts/owner-store.ts), [preload](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/desktop/src/preload/preload.mts), and [main.ts](/Users/la/Programming/tovu-integration-clones/tovu-fu/apps/desktop/main.ts): API exposure, native backup dialogs, startup catch-up.
- Added CLI/IPC tests and updated preload tests.

Sync runs after successful put/grant and during site startup, including external attachments. Partial copy failures preserve the committed save and return retry details. SQLite stays in the CLI child.

Reused the existing spawn/env builders, keyed serializer, S2 frame check, and CLI/Jini persistence lifecycle. No dependencies installed or commits made; concurrent website edits were untouched.

Main/preload typechecks and whitespace checks pass. Measured maximum CCN: CLI **10**, IPC **10**, main **8**, preload **3**. Static architecture review passes. Runtime and coverage assessment remain **INCONCLUSIVE** because tests were intentionally not run.

S4 receives `window.tovuOwnerStore`, typed by `OwnerStoreBridge`:

| Methods | Input |
|---|---|
| `status`, `list` | `{}` |
| `put` | `{entry: {id?, kind?, label, provider, meta, payload, expectedRevision}}` |
| `delete` | `{entryId, expectedRevision}` |
| `grant`, `revoke` | `{entryId, siteId}` |
| `sync` | `{siteId}` |
| `export`, `restore` | `{passphrase}` |

Every method accepts optional second argument `{}` and returns a v1 `{ok, action, data|error}` envelope. Creation uses `expectedRevision: null`; replacement requires the entry ID and current revision. Put/grant success replies include `sync: [{siteId, reply}]`; put may include `syncError`. Backup cancellation returns error code `cancelled`. Main chooses paths through native dialogs.

Exact scoped test command, **not executed**:

```bash
cd apps/desktop
node --test --test-concurrency=1 --experimental-test-module-mocks \
  --import ./scripts/resolve-ts-ext.ts \
  src/owner-store-cli.test.ts \
  src/owner-store-ipc.test.ts \
  src/preload/preload.test.ts \
  src/main-auth-wiring.test.ts \
  src/main-project-wiring.test.ts
```

This shard uses `node:test`; no Vitest target changed.
