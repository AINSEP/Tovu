# T5 (Tovu, D0c2b): daemon-connection schemas -> `@tovu/contracts/daemon-connection`; module state stays (~60k, T; P owed)

No Jini change. The schemas are Tovu's protocol between the desktop agent service and the site server (both parse with them); they need only `zod`.

## Census (step 0; expected on 2d82735a)
```bash
git grep -n -E "assistant-daemon-connection(\.js|\.ts)?['\"]" -- apps development
```
Expected 12 files; the ones that take a schema or schema type (the rest take only state functions and are **not edited**): desktop `src/desktop-agent-service.ts:19` (`daemonControlRequest`, `daemonEndpoint`, `siteIdleStopReply`, type `DaemonSiteRegistration`); website `server/inbound/assistant/agent-daemon-scope-control.ts` (`daemonControlRequest`), `server/runtime/composition/modules/assistant-tool-exec.ts` (type `AssistantDaemonConnection` + state functions), `server/runtime/lifecycle/daemon-supervisor.ts` (`daemonConnection`, `siteIdleStopReply`, `daemonControlRequest` + state functions).

## One commit: `refactor(contracts): daemon control schemas move into @tovu/contracts`
- NEW `packages/contracts/src/daemon-connection.ts` = `apps/website/src/server/runtime/lifecycle/assistant-daemon-connection.ts` lines 1-2 and 4-25 verbatim (file comment, `zod` import, the `scopeKey` why-comment, `daemonSiteRegistration`, `DaemonSiteRegistration`, `daemonControlRequest`, `siteIdleStopReply` + its comment, `daemonEndpoint`, `daemonConnection`, `AssistantDaemonConnection`). Line 3 (`currentAgentDaemonToken` from `#src/...`) is NOT copied: `rg -n "#src|website/src" packages/contracts/src` must stay empty (STOP otherwise).
- Website file keeps line 3 and lines 27-46 (state), adds `import type { AssistantDaemonConnection } from "@tovu/contracts/daemon-connection";`, and no longer exports any schema (no re-export).
- `packages/contracts/package.json` `dependencies`: `"zod": "^3.25.76"` (root range, `package.json:202`) + root lockfile (`npx npm@11.12.1 install --package-lock-only`).
- Repoint the 4 files above (split imports where a file also takes state functions).
- `apps/desktop/package.json` `dependencies`: `"zod": "^3.25.76"` (the desktop lock already resolves `node_modules/zod` 3.25.76 transitively; declaring it makes the runtime import from `app.asar` intentional) + `apps/desktop/package-lock.json`. G-DEP `NAME=zod`.
- `apps/desktop/src/dist-import-check.test.ts`: append `"server/runtime/lifecycle/assistant-daemon-connection"`.

Characterization: NEW `packages/contracts/src/__tests__/daemon-connection.test.ts` = reverted `09669849:packages/host-shared/src/__tests__/daemon-connection.unit.test.ts` (35 lines, 4 tests) with its import line pointed at `../daemon-connection.js` (named `.test.ts` so the root glob `packages/*/src/**/*.test.ts` runs it, like `hosted-sign-in-links.test.ts`). Green control: the same 4 tests pass against the website file on `B` (run once with the import pointed there, then drop that scratch edit).
Mutation proofs (from `desktop-d0c-2.md`): drop `.strict()` on the `ready` member -> RED; drop it on `siteIdleStopReply` -> RED; restore.
Tests (`FILES`): `packages/contracts/src/__tests__/daemon-connection.test.ts apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts`. Desktop `desktop-agent-service.test.ts` runs inside `npm run gates`.
Staging check: previous list minus `server/runtime/lifecycle/assistant-daemon-connection.ts`.
