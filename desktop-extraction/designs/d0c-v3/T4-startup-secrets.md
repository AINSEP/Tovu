# T4 (Tovu, D0c2a): startup secret names -> `@tovu/contracts`; the desktop main consumes them with Jini; website state stays (~80k, T; P owed)

Needs: J3 built and linked. Landing condition as T1 (pin to the sidecar release with J3).

## Census (step 0; expected on 2d82735a)
```bash
git grep -n -E "startup-secrets(\.js|\.ts)?['\"]" -- apps development
git grep -n "startupSecretEnvironment" -- apps/desktop                   # nothing: the desktop never reads the stored credentials
```
Expected 20 files. Names only (`STARTUP_SECRET_KEYS`, `DESKTOP_AGENT_SERVICE_ENV`): desktop `src/tovu-server.ts:31`; website `server/runtime/lifecycle/daemon-supervisor.ts:22`, tests `server/runtime/boot/__tests__/boot-credential-order.pins.unit.test.ts:7`, `server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts:10`, and `platform/secrets/__tests__/startup-secrets.unit.test.ts:3` (names + functions). Function `initializeStartupSecrets` from the desktop: `src/main/index.ts:115,203`. Every other importer (website `startupSecretEnvironment`/`initializeStartupSecrets` users, the two serve mocks, the two child-process script strings) keeps the website module and is **not edited**.

## One commit: `refactor(secrets): startup secret names live in @tovu/contracts; the desktop main consumes them through Jini`
- NEW `packages/contracts/src/startup-secrets.ts`: `STARTUP_SECRET_KEYS` and `DESKTOP_AGENT_SERVICE_ENV` with their comments, moved verbatim from `apps/website/src/platform/secrets/startup-secrets.ts:4-7` (pure constants, no import).
- `apps/website/src/platform/secrets/startup-secrets.ts`: delete those lines; `import { STARTUP_SECRET_KEYS } from '@tovu/contracts/startup-secrets'`; `initializeStartupSecrets` body becomes
  ```ts
  if (startup) return startup;
  const consumed = consumeNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS });
  credentials = consumed.inherited;
  startup = consumed.received.then(received => { if (received) credentials = received; });
  return startup;
  ```
  (`consumeNodeStartupSecrets` from `@jini-ai/sidecar/supervisor/node`; the file's header line and the two functions' TSDoc stay; `startupSecretEnvironment` unchanged). Same effect order as before (J3 keeps it); same memo (second call returns the same promise).
- Repoint the names: `tovu-server.ts:31`, `daemon-supervisor.ts:22`, `boot-credential-order.pins.unit.test.ts:7`, `daemon-startup-secrets.unit.test.ts:10`, `startup-secrets.unit.test.ts:3` (split: names from `@tovu/contracts/startup-secrets`, functions stay on `../startup-secrets.js`).
- `apps/desktop/src/main/index.ts:115`: replace with `import { consumeNodeStartupSecrets } from '@jini-ai/sidecar/supervisor/node';` + `import { STARTUP_SECRET_KEYS } from '@tovu/contracts/startup-secrets';`; `:203` `await initializeStartupSecrets({}, {});` -> `await consumeNodeStartupSecrets({ keys: STARTUP_SECRET_KEYS }).received;` (the comment above it stays). The desktop main never reads the stored credentials (census line 2), so no state is needed there.
- `apps/desktop/src/dist-import-check.test.ts`: append `"platform/secrets/startup-secrets"`.
- G-DEP: `NAME=@jini-ai/sidecar`.

Characterization (from reverted `26c8df0c:packages/host-shared/src/__tests__/startup-secrets.unit.test.ts`, 3 tests, green on `B` when pointed at the website file):
- NEW `packages/contracts/src/__tests__/startup-secrets.test.ts`: its test 1 ("the credential key list is the installed launchers' compatibility surface, name for name"), import `../startup-secrets.js`.
- Its tests 2 ("... a second call returns the SAME promise") and 3 ("a custom environment never receives a launch credential") are appended to the website's `platform/secrets/__tests__/startup-secrets.unit.test.ts` (allowed edit (d)), importing `../startup-secrets.js`.
- Existing pins, unchanged: `startup-secrets.unit.test.ts` (2 tests, one in a child process), `boot-credential-order.pins.unit.test.ts`, `daemon-startup-secrets.unit.test.ts`, `desktop-mcp-runtime.process-env.unit.test.ts`.
Mutation proofs: (1) in the website body, drop `if (startup) return startup;` -> the same-promise case fails; (2) drop `credentials = consumed.inherited;` -> the daemon-token case at `startup-secrets.unit.test.ts:14` fails. Restore each.
Tests (`FILES`): `packages/contracts/src/__tests__/startup-secrets.test.ts apps/website/src/platform/secrets/__tests__/startup-secrets.unit.test.ts apps/website/src/server/runtime/boot/__tests__/boot-credential-order.pins.unit.test.ts apps/website/src/server/runtime/lifecycle/__tests__/daemon-startup-secrets.unit.test.ts apps/website/src/assistant/__tests__/desktop-mcp-runtime.process-env.unit.test.ts apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts apps/website/src/cli/__tests__/unit/serve-import-cleanup.unit.test.ts`.
Staging check: previous list minus `platform/secrets/startup-secrets.ts`.
