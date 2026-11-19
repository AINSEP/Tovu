# T5 (Tovu, D0c2b): daemon-connection schemas -> `@tovu/contracts/daemon-connection`; module state stays (one repo: Tovu; Codex-ready, no Jini change)

The schemas are Tovu's protocol between the desktop agent service and the site server (both parse with them); they need only `zod`.
Jini for verification: the Jini start SHA. New desktop dependency: **`zod`** (`^3.25.76`, the root's range, root `package.json:202`; the desktop lock already resolves `node_modules/zod` 3.25.76 transitively, declaring it makes the runtime import from `app.asar` intentional). Manifests changed: `packages/contracts/package.json`, `apps/desktop/package.json`.
Named tests: `packages/contracts/src/__tests__/daemon-connection.test.ts`, `apps/website/src/server/runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts`, `apps/desktop/src/desktop-agent-service.test.ts`.
Expected staging list on `C`: the list before this sheet minus `src/server/runtime/lifecycle/assistant-daemon-connection.ts`.

## Files to change (one commit: `refactor(contracts): daemon control schemas move into @tovu/contracts`)
- NEW `packages/contracts/src/daemon-connection.ts` = `apps/website/src/server/runtime/lifecycle/assistant-daemon-connection.ts` lines 1-2 and 4-25 verbatim (file comment, `zod` import, the `scopeKey` why-comment, `daemonSiteRegistration`, `DaemonSiteRegistration`, `daemonControlRequest`, `siteIdleStopReply` + its comment, `daemonEndpoint`, `daemonConnection`, `AssistantDaemonConnection`). Line 3 (`currentAgentDaemonToken` from `#src/...`) is not copied.
- Website file keeps line 3 and lines 27-46 (state), adds `import type { AssistantDaemonConnection } from "@tovu/contracts/daemon-connection";` (plus a value import of any schema its state functions use), and exports no schema (no re-export).
- `packages/contracts/package.json` `dependencies`: `"zod": "^3.25.76"`. `apps/desktop/package.json` `dependencies`: `"zod": "^3.25.76"`. **After both manifest edits**, regenerate with `npx npm@11.12.1 install --package-lock-only --ignore-scripts`: repo root, `apps/desktop`, `apps/admin` (all three lockfiles record the contracts package's dependencies; the desktop's also records its own new direct dependency).
- Repoint the 4 schema users (split where a file also takes state functions): desktop `apps/desktop/src/desktop-agent-service.ts:19`; website `server/inbound/assistant/agent-daemon-scope-control.ts:2`, `server/runtime/composition/modules/assistant-tool-exec.ts:1` (type `AssistantDaemonConnection` only), `server/runtime/lifecycle/daemon-supervisor.ts:32` (`daemonConnection`, `siteIdleStopReply`, `daemonControlRequest`). The other 8 importers take only state functions: not edited.
- `apps/desktop/src/dist-import-check.test.ts`: append `"server/runtime/lifecycle/assistant-daemon-connection"`.

## Characterization tests to add
NEW `packages/contracts/src/__tests__/daemon-connection.test.ts` = reverted `09669849:packages/host-shared/src/__tests__/daemon-connection.unit.test.ts` (35 lines, 4 tests) with its import line pointed at `../daemon-connection.js`. Green on `P` first with the import pointed at the website file (verifier: scratch edit, run, drop).
Red checks: drop `.strict()` on the `ready` member -> red; drop it on `siteIdleStopReply` -> red.

## STOP conditions
- `git grep -n -E "assistant-daemon-connection(\.js|\.ts)?['\"]" -- apps development` lists other than the 12 files of the census (desktop `desktop-agent-service.ts:19`; website `agent-daemon-scope-control.ts`, `assistant-daemon-client.ts`, `assistant-tool-access-lowering.ts`, `assistant-tool-exec.ts`, `assistant.ts`, `run-daemon-http-client.ts`, `run-daemon-origins.ts`, `agent-daemon-port.ts`, `daemon-supervisor.ts`, `warm-site-retirement.ts`; test `assistant-daemon-connection.test.ts`).
- `rg -n "#src|website/src" packages/contracts/src` prints anything.
- `apps/desktop/package.json` already declares `zod`.
- Any lockfile command fails: commit nothing more, report.
