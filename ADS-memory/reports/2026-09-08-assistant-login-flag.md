# Assistant Local CLI login isolation flag — 2026-09-08

## Task
Fix the assistant's default Local CLI runtime returning `Not logged in · Please run /login`, caused by
Tovu (`d2bb8629`) + Jini (`fa1afc58`) landing `CLAUDE_CONFIG_DIR` isolation unconditionally for every
`claude`-id run on 2026-09-07. Put isolation behind a config flag defaulting OFF, without adding token
plumbing, while proving `ASSISTANT_DISALLOWED_TOOLS` stays independent of that flag.

## What I found on arrival
The Jini working tree (`/Users/la/Programming/Jini`, shared repo, other agents' unrelated files also
dirty) already had an **uncommitted** production fix in
`packages/daemon/src/agent-executor.ts`: a new `claudeConfigDirIsolationEnabled` option on
`CreateAgentExecutorOptions`, defaulting `false`, gating `prepareClaudeConfigDirIfNeeded` alongside the
existing `def.id === 'claude'` check. Its doc comments already stated the exact trade-off this task
asked for (verbatim reasoning about the Keychain-login/CLAUDE_CONFIG_DIR link). This is very likely
leftover work from a prior agent on this same task that was rotated out before committing (matches
today's "commit before TaskStop" incident pattern) — I verified it rather than trusting it, then
finished it: its own test suite (`packages/daemon/src/__tests__/agent-executor.test.ts`) still asserted
the OLD unconditional behavior and would have failed the moment `vitest` ran.

## What I did
**Jini** (`packages/daemon/src/__tests__/agent-executor.test.ts`, commit `20d04689` on branch
`general-work`):
- Added `claudeConfigDirIsolationEnabled` to the test harness (`HarnessOptions`/`createHarness`).
- Updated all 7 existing "Finding 1" isolation tests to pass `claudeConfigDirIsolationEnabled: true`
  explicitly (they test the mechanism itself and must keep exercising it now that it's gated).
- Added a new test proving the default-off behavior: a `claude`-id def with seams configured stages
  nothing when the flag is omitted.
- Added an independence test: one real `.run()` call with isolation left at its default (off) still
  forwards `disallowedTools` into the def's own argv via `buildAgentBuildArgsOptions` — proving
  Finding 2's tool restriction is not collateral damage of the rollback. Asserts BOTH `CLAUDE_CONFIG_DIR`
  is absent from the spawned env AND `--disallowedTools Bash Edit Write` is present in argv, in the
  same run.
- `npx vitest run src/__tests__/agent-executor.test.ts` → **346/346 pass**. `tsc -p tsconfig.json
  --noEmit` clean. Rebuilt dist (`npx tsc -p tsconfig.json`) — daemon package only, never `pnpm -r
  build` (Tovu's `node_modules/@jini-ai/daemon` is a symlink into this checkout).

**Tovu** (`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`):
- Added `claudeConfigDirIsolationEnabled: false` explicitly to the `createAgentExecutor({...})` call
  (was previously absent — the option didn't exist in dist yet), with an inline comment stating plainly
  that this reopens the personal-`~/.claude` leak Finding 1 closed and why that trade was chosen (no
  `credentialEnv` for this runtime; the operator has declined `claude setup-token` twice). Per the
  dispatch, **no token plumbing was added** — `credentialEnv`/`AgentExecutorRunInput.credentialEnv`
  already exists and is untouched; provisioning a real credential is a later decision.
- `ASSISTANT_DISALLOWED_TOOLS` (Finding 2) was NOT touched — it was already unconditional and
  structurally independent (flows through `AgentExecutorRunInput.disallowedTools` at `.run()` time, a
  completely separate path from `CreateAgentExecutorOptions.claudeConfigDirIsolationEnabled` at
  `createAgentExecutor()` construction time).
- Full repo-root `tsc -p tsconfig.json --noEmit` → clean (ran in background under load ~250-350;
  completed with empty output / exit 0).
- Scoped unit tests: `agent-daemon-server.tool-restriction-wiring.unit.test.ts` (2/2) +
  `assistant-system-overlay.unit.test.ts` (15/15) → all pass, run via `node --import tsx --test`
  with `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json` (repo-root invocation, matching this repo's
  convention).

## Daemon restart
Editing `agent-daemon-server.ts` under `apps/website/src` triggered the tsx-watch API's own respawn of
the daemon child automatically (confirmed via `ps`: a fresh `agent-daemon-server.ts --workspace
workspace-local` child appeared at the same wall-clock second as the edit). No manual kill was needed
or attempted. The daemon self-allocates a free port (see `daemon-supervisor.ts`'s "self-allocation fix"
comment) rather than binding 4319 — I initially probed the wrong port; `lsof -p <pid>` found it
listening on `127.0.0.1:65183`, and `curl` got a `401` (expected — bearer-token gated), confirming it
booted successfully after picking up both the new Jini dist and the Tovu wiring change.

## Live behavior — before/after, observed not predicted
Browser-based verification (Playwright — "already in use"; claude-in-chrome fallback) was unusable: the
Chrome extension timed out/disconnected repeatedly under today's load (peaked at 352/250/188 during
this task — `uptime` checked before every timing-sensitive step). Rather than force a flaky UI path, I
reproduced the exact mechanism directly with the real `claude` CLI (2.1.263, matching the version both
commits verified against), using the identical baseline env `agent-executor.ts`'s `buildAgentEnv`
constructs (`PATH`/`HOME`/`USER`/`SHELL`/`TMPDIR`/`LANG`, no `CLAUDE_CONFIG_DIR` — since the flag is now
off):

- **Before (isolation on, the unconditional 2026-09-07 behavior)** — `CLAUDE_CONFIG_DIR` set to a fresh
  `mktemp -d`: `claude auth status` → `{"loggedIn": false, "authMethod": "none", ...}`, exit 1. This is
  the literal bug reported.
- **After (this fix, flag off — Tovu's current wiring)** — no `CLAUDE_CONFIG_DIR` override, real
  `~/.claude`: `claude auth status` → `{"loggedIn": true, "authMethod": "claude.ai", "email":
  "leonaburime@gmail.com", "subscriptionType": "max", ...}`, exit 0.
- **Combined proof, one real spawned turn**: `claude -p "Reply with exactly the single word: OK"
  --disallowedTools Bash Edit Write Task CronCreate CronDelete CronList EnterWorktree ExitWorktree
  RemoteTrigger Workflow --output-format json` under the same baseline env →
  `"result":"OK"`, `"is_error":false`, `"terminal_reason":"completed"`. Proves login and the tool
  restriction both hold in the same real run — not just `auth status` in isolation. (This made one real,
  billed API call; cost reported as $0.144.)

## Open items / not verified
- Did **not** get a full admin-UI chat-panel screenshot of "before" vs "after" — the browser tooling was
  unusable under load for the ~10 minutes I tried it (Playwright refused a second instance; claude-in-
  chrome's extension timed out on `find`/`screenshot`/`get_page_text` repeatedly, then the whole MCP tab
  group vanished). The CLI-level reproduction above is the same underlying mechanism the daemon spawns
  (same binary, same env-construction logic, same flags) and is deterministic where the browser wasn't,
  but it is not a pixel-level UI confirmation. Recommend a follow-up screenshot pass once load drops if
  that visual confirmation still matters.
- Did not provision any `credentialEnv` for the Local CLI runtime — out of scope per the dispatch.
- Did not touch `apps/website/src/features/**` delete-confirmation code, `mcp-ui-tool-calls.ts`, or
  `apps/admin/src/lib/api.ts` (other agents' scope).

## Commits
- Jini `20d04689` (branch `general-work`): `fix(daemon): gate claude's CLAUDE_CONFIG_DIR isolation
  behind a default-off flag` — `packages/daemon/src/agent-executor.ts`,
  `packages/daemon/src/__tests__/agent-executor.test.ts`.
- Tovu (this commit): `apps/website/src/server/inbound/assistant/agent-daemon-server.ts` +
  this report.
