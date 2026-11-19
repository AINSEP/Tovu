# T4 (Tovu, D0c2a): startup secret names -> `@tovu/contracts`; website and desktop take secrets with J3's two sync halves (edits one repo: Tovu; Codex-ready after J3 lands)

Jini for verification: the J3 branch tip. New desktop dependency: none (`@jini-ai/sidecar` is declared, `apps/desktop/package.json:41`). Landing manifests (COMMON section 6): root `package.json:166` and `apps/desktop/package.json:41` (`@jini-ai/sidecar`; both the website and the desktop call J3's functions), then the root and `apps/desktop` lockfiles. Jini release inventory: J3 (`api-baseline/jini-ai__sidecar.json`, `.changeset/sidecar-take-startup-secrets.md`).
Named tests: `packages/contracts/src/__tests__/startup-secrets.test.ts`, `apps/website/src/platform/secrets/__tests__/startup-secrets.unit.test.ts`, `apps/website/src/server/runtime/boot/__tests__/boot-credential-order.pins.unit.test.ts`, `apps/website/src/server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts`, `apps/website/src/assistant/__tests__/desktop-mcp-runtime.process-env.unit.test.ts`, `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`, `apps/website/src/cli/__tests__/unit/serve-import-cleanup.unit.test.ts`, `apps/website/src/__tests__/index-boot.characterization.test.ts`, `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts`.
Expected staging list on `C`: the list before this sheet minus `src/platform/secrets/startup-secrets.ts`.

## Files to change (one commit: `refactor(secrets): startup secret names live in @tovu/contracts; hosts take secrets through Jini`)
- NEW `packages/contracts/src/startup-secrets.ts`: `STARTUP_SECRET_KEYS` and `DESKTOP_AGENT_SERVICE_ENV` with their comment, moved verbatim from `apps/website/src/platform/secrets/startup-secrets.ts:4-7` (pure constants, no import).
- `apps/website/src/platform/secrets/startup-secrets.ts`: delete `:4-7`; imports become `import { allowedNodeStartupSecrets, receiveNodeStartupSecrets, takeNodeStartupSecrets } from '@jini-ai/sidecar/supervisor/node';` and `import { STARTUP_SECRET_KEYS } from '@tovu/contracts/startup-secrets';`. `initializeStartupSecrets` body (`:19-32`) becomes:
  ```ts
  if (startup) return startup;
  const taken = takeNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS }, { env: process.env });
  credentials = taken.inherited;
  startup = (async () => {
    if (!taken.fromIpc) return;
    const received = await receiveNodeStartupSecrets({ peer: process });
    credentials = allowedNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS, record: received });
  })();
  return startup;
  ```
  Effect order vs `P` (judge 3 S1): split, scrub, read marker, delete marker, **assign inherited credentials, then start IPC** (on `P` the assignment sat between scrub and marker read; both are synchronous and nothing reads `credentials` in between, so the observable order "credentials before IPC" is kept). The returned promise is the same `async` IIFE as on `P` with one `await` (the receive), so its settling time is unchanged; the second call returns the same promise. The header line, both TSDoc blocks and `startupSecretEnvironment` stay.
- Repoint the names to `@tovu/contracts/startup-secrets`: desktop `apps/desktop/src/tovu-server.ts:31`; website `server/runtime/lifecycle/daemon-supervisor.ts:22`; tests `server/runtime/boot/__tests__/boot-credential-order.pins.unit.test.ts:7`, `server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts:10`, `platform/secrets/__tests__/startup-secrets.unit.test.ts:3` (split: names from contracts, functions stay on `../startup-secrets.js`). Every other importer (website `startupSecretEnvironment`/`initializeStartupSecrets` users, the serve mocks, the child-process script strings, `development/evals/tool-search-caller2-compliance-harness.ts:94`) keeps the website module: not edited.
- `apps/desktop/src/main/index.ts:115`: replace with `import { allowedNodeStartupSecrets, receiveNodeStartupSecrets, takeNodeStartupSecrets } from "@jini-ai/sidecar/supervisor/node";` and `import { STARTUP_SECRET_KEYS } from "@tovu/contracts/startup-secrets";`. `:203` `await initializeStartupSecrets({}, {});` becomes (the comment above it stays):
  ```ts
  const startupSecretsFromIpc = takeNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS }, { env: process.env }).fromIpc;
  await (async () => {
    if (!startupSecretsFromIpc) return;
    allowedNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS, record: await receiveNodeStartupSecrets({ peer: process }) });
  })();
  ```
  Same shape as the website's IIFE, so the same scrub-before-anything order and the same single top-level await. The desktop main never read the stored credentials (`git grep -n startupSecretEnvironment -- apps/desktop` is empty), and each staged website bundle already held its own copy of that module state, so no state is dropped.
- `apps/desktop/src/dist-import-check.test.ts`: append `"platform/secrets/startup-secrets"`.

## Characterization tests to add (green on `P` first)
- NEW `packages/contracts/src/__tests__/startup-secrets.test.ts` = test 1 of reverted `26c8df0c:packages/host-shared/src/__tests__/startup-secrets.unit.test.ts` ("the credential key list is the installed launchers' compatibility surface, name for name"), import `../startup-secrets.js`.
- Appended to `apps/website/src/platform/secrets/__tests__/startup-secrets.unit.test.ts` (allowed edit d), importing `../startup-secrets.js`: tests 2 ("... a second call returns the SAME promise") and 3 ("a custom environment never receives a launch credential") of that reverted file; plus NEW "inherited credentials are adopted before startup IPC answers": a child process (same pattern as the file's existing child test at `:78`), spawned with an IPC channel and env `TOVU_AGENT_DAEMON_TOKEN=inherited`, `JINI_STARTUP_SECRETS_IPC=1`; the parent answers with `provideNodeStartupSecrets({ peer: child, secrets: { TOVU_AGENT_DAEMON_TOKEN: "received" } })` only after the child has written its first line. The child calls `initializeStartupSecrets()` without awaiting, writes `startupSecretEnvironment({ env: process.env }).TOVU_AGENT_DAEMON_TOKEN` and `process.env.TOVU_AGENT_DAEMON_TOKEN`, awaits, writes the first value again. Expected lines: `inherited`, `undefined`, `received`.
- Existing pins, unchanged: `startup-secrets.unit.test.ts` (2 tests), `boot-credential-order.pins.unit.test.ts`, `daemon-startup-secrets.unit.test.ts`, `desktop-mcp-runtime.process-env.unit.test.ts`, `index-boot.characterization.test.ts:115-116`, `composition-boot-order.unit.test.ts:109`.
Red checks: (1) drop `if (startup) return startup;` -> the same-promise test fails; (2) move `credentials = taken.inherited;` into the IIFE after its `if` line -> the new ordering test fails (first line `undefined`). (The scrub itself is pinned by J3 case 1 and the existing `boot-credential-order` pins.)

## STOP conditions
- `git grep -n -E "startup-secrets(\.js|\.ts)?['\"]" -- apps development` lists a desktop line other than `src/main/index.ts:115` and `src/tovu-server.ts:31`, or a name importer (`STARTUP_SECRET_KEYS`/`DESKTOP_AGENT_SERVICE_ENV`) other than the five listed.
- `git grep -n startupSecretEnvironment -- apps/desktop` prints anything.
- J3's functions are not exported from `@jini-ai/sidecar/supervisor/node` in the linked Jini.
