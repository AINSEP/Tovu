# 2026-09-07 — assistant env isolation + tool-restriction fix (SEC-assistant-env-isolation-2026-09-07)

Programmer agent. Bootstrap: `AI-Dev-Shop/agents/programmer/skills.md` loaded (confirmed in first
reply). Implements both findings from
`ADS-memory/reports/security/SEC-assistant-env-isolation-2026-09-07.md`, which deliberately stopped
at analysis. Owner authorization (relayed by `team-lead`): "do the best long term fix, don't cheat…
what's best for the future and for completeness, and will cause me less headaches and less hidden
bugs."

## Finding 2 (tool-restriction mechanism) — DONE, fully wired end to end

**Mechanism** (`@jini-ai/agent-runtime`, product-neutral):
- `packages/agent-runtime/src/types.ts` — `RuntimeBuildOptions.disallowedTools?: readonly string[]`
  and `.allowedTools?: readonly string[]`.
- `packages/agent-runtime/src/defs/claude.ts` `buildArgs` — emits `--disallowedTools <names...>` /
  `--allowedTools <names...>` when non-empty, placed after every other flag so an omitted value is a
  true no-op (byte-identical argv for every existing call site).
- `packages/daemon/src/agent-executor.ts` — `AgentExecutorRunInput.disallowedTools`/`.allowedTools`,
  threaded through `buildAgentBuildArgsOptions` into `RuntimeBuildOptions`.

**Flag verification (not assumed):** installed Claude Code 2.1.263's own `-p --help` confirmed
`--disallowedTools, --disallowed-tools <tools...>` / `--allowedTools, --allowed-tools <tools...>`
("Comma or space-separated list of tool names"). Live-tested `claude -p "Run the bash command: echo
hello-from-bash-tool" --disallowedTools Bash --permission-mode bypassPermissions` — the spawned
session reported it had no Bash tool and worked around it, proving the restriction is enforced by
the CLI itself, not merely a prompt suggestion, and that it holds even under `bypassPermissions`.

**Tovu policy (evidence-based, not opinion):** opened `sites/tovu-com/chat.db` read-only
(`file:...?mode=ro`) and parsed `ai_chat_messages.events_json` for every `tool_use` name across all
32 real admin-chat runs recorded. Observed tool names: `mcp__jini__search_tools`,
`mcp__jini__describe_tool`, `mcp__jini__execute_delegated_tool`,
`mcp__jini__execute_readonly_delegated_tool` (plus unprefixed variants of the same four), `ToolSearch`,
`Read`, and Tovu's own catalog (`assistant_ask_choice`, `seo_*`, `media_*`, `content_post_search`,
`custom_credential_list`, …) plus federated `mcp__higgsfield__*`. **Zero** occurrences of `Bash`,
`Edit`, `Write`, `Task`, any `Cron*`, `EnterWorktree`/`ExitWorktree`, `RemoteTrigger`, or `Workflow`.

New `ASSISTANT_DISALLOWED_TOOLS` constant in `assistant-system-overlay.ts` (full evidence + reasoning
in its own doc comment) = exactly that host-CLI-builtin set — the same list the security report
itself named. `Read`/`ToolSearch` and Tovu's own catalog names are deliberately NOT restricted (real
observed use; over-tightening was the explicit thing to avoid). `agent-daemon-server.ts`'s
`agentExecutor.run({...})` now passes `disallowedTools: ASSISTANT_DISALLOWED_TOOLS` unconditionally,
independent of `TOVU_AGENT_FORBID_BASH`/`BASH_PROHIBITION_BLOCK` (untouched, per instruction — its
own doc comment updated to point at this as the real gate, without rewording the block itself).

**RED/GREEN:**
- `claude.ts` buildArgs: 3 new tests RED (`expected -1 to be greater than -1` / missing flag) before
  the `buildArgs` change, GREEN after (`40/40 passed`).
- `buildAgentBuildArgsOptions`: implemented alongside the type change, then pinned with 3 new tests —
  GREEN (49/49 in `agent-executor-helpers.test.ts`).
- Tovu wiring: `assistant-system-overlay.unit.test.ts` (+2 tests) and new
  `agent-daemon-server.tool-restriction-wiring.unit.test.ts` (+2 tests, source-text wiring proof in
  the same style as the existing H1/H2 wiring suite) — GREEN, 33/33 across the touched assistant test
  files including regression coverage for session-resume/attachment/unhandled-rejection wiring.

## Finding 1 (env isolation) — DONE, with one honestly-scoped residual gap

**Mechanism**, mirroring `prepareCodexHomeIfNeeded`/`prepareCodexHomeForRun`'s exact shape in
`packages/daemon/src/agent-executor.ts`:
- `resolveSourceClaudeConfigDir(hostEnv)` — `CLAUDE_CONFIG_DIR` override else `~/.claude`.
- `prepareClaudeConfigDirForRun` — `mkdtemp`s a fresh scratch dir, best-effort copies a real
  `.credentials.json` if the source has one, returns `{path, cleanup}`.
- `prepareClaudeConfigDirIfNeeded` — gated on `def.id === 'claude'` (not on MCP strategy: `codebuddy`
  shares `'claude-mcp-json'` but is a different CLI with no `~/.claude` semantics), **unconditional**
  for every `claude` run regardless of whether `mcpJsonInjection` is configured.
- `CreateAgentExecutorOptions.claudeConfigDirIsolation` (new, optional, real-fs-by-default seams bag)
  and `computeChildEnv`'s new `claudeConfigDir` parameter → sets `CLAUDE_CONFIG_DIR` on the child env.
- Cleanup wired into the same `cleanupStagedFiles` closure as `preparedCodexHome`.

**What the spawned child could see before vs after:**
- Before: `HOME` forwarded verbatim, `CLAUDE_CONFIG_DIR` never set → child resolves
  `$HOME/.claude` → operator's real skills, plugins, agents, memory-path index, settings — a 40-entry
  personal tool grant per the prior investigation's transcript (`Task`, `Edit`, `Write`, `Cron*`,
  worktree tools, `RemoteTrigger`, …), host-dependent and undocumented from Tovu's own product
  framing.
- After: `CLAUDE_CONFIG_DIR` points at a fresh, empty, run-scoped `mkdtemp` directory. No
  settings.json/skills/plugins/agents/memory index — the CLI falls back to its own built-in defaults,
  not an error. Removed on child close (or on any pre-spawn failure path) via the existing
  `cleanupStagedFiles` machinery.

**Login preservation — proof, not assumption (this was the task's explicit stop-and-verify gate):**
- Live-tested against installed Claude Code 2.1.263 (macOS, this dev machine): `claude auth status`
  with real `HOME` but a fresh `CLAUDE_CONFIG_DIR` reports `loggedIn: false`. Same result with `HOME`
  faked too. So on THIS host, isolation genuinely does break the inherited-Keychain-login path if
  nothing else changes — I did not assume the fix was free.
- Confirmed why via Anthropic's own docs (code.claude.com/docs/en/authentication, fetched live):
  "If you've set the CLAUDE_CONFIG_DIR environment variable, Claude Code keeps the .credentials.json
  file under that directory instead, including the file the macOS fallback writes, and **keys the
  macOS Keychain entry to that directory too**, so a session with a different CLAUDE_CONFIG_DIR reads
  a different entry." The Keychain token is directory-scoped, not just HOME-scoped — a fact the
  security report flagged as unverified and asked me to check before landing.
- Confirmed via `chat.db`/`agent-daemon-server.ts` grep: Tovu's admin-chat `claude` runs pass **no**
  `credentialEnv`/`ANTHROPIC_API_KEY` today (zero hits) — the assistant currently authenticates
  purely by inheriting the operator's real, personal Keychain-backed subscription login. That is
  precisely Finding 1's leak, and precisely what breaks once CLAUDE_CONFIG_DIR is isolated with
  nothing else changed.
- **Design decision, not a workaround:** `prepareClaudeConfigDirForRun` best-effort-copies a real
  `.credentials.json` when the source config dir has one (Linux, Windows, or a Keychain-locked macOS
  fallback — the CLI's own docs name all three as file-based storage cases) — this is the *portable*
  case, closed exactly like Codex's own `auth.json` copy. On a normal macOS-Keychain-only install (no
  file to copy — confirmed the case on this codebase's own dev machine), this code does **not**
  attempt to extract the Keychain secret itself (no `security find-generic-password` call from this
  daemon code): that would mean this process pulling a live OAuth token out of an OS-managed
  encrypted store into a plaintext scratch file, a materially larger security surface than forwarding
  an already-resolved credential — and it directly conflicts with this task's own "never read or
  reproduce credential values" constraint. Instead this mirrors `prepareCodexHomeForRun`'s own
  **already-accepted, already-shipped** outcome for a missing credential file verbatim: "the spawned
  CLI runs unauthenticated" is documented, precedented behavior in this exact file, not a new failure
  mode invented for this fix.

**Residual, explicitly-flagged consequence — action needed before/at daemon restart:**
On this dev machine (macOS, Keychain-only, no dedicated Anthropic credential configured for the
assistant), once this fix is live (daemon restarted), the admin-chat `claude` runs will lose the
inherited personal login and run unauthenticated until one of:
1. Tovu supplies a credential via the *already-existing, already-tested*
   `AgentExecutorRunInput.credentialEnv` (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` — both
   outrank Keychain-based subscription login in Claude Code's own auth precedence, so the isolated
   child authenticates without ever touching the operator's personal Keychain entry at all — no new
   plumbing needed, this env var already flows through `buildAgentEnv`/`resolveRunEnv`, verified live
   by `env.test.ts:14`), most cleanly a long-lived token from `claude setup-token` (Anthropic's own
   documented mechanism for exactly this headless/CI case), or
2. an operator on Linux/Windows/Keychain-locked-macOS, where a file-based `.credentials.json` exists
   and this fix already copies it automatically — no action needed there.

I chose to land the isolation unconditionally rather than gate it behind "only if a credential is
configured," because the alternative (silently keep leaking on every install with no credential) is
exactly the "cheat" the owner's instruction ruled out, and a loud, documented "configure a credential
to keep the assistant authenticated" requirement is a normal, recoverable consequence of closing a
High-severity leak — not a silent regression. This is a decision, not an oversight: flagging it
explicitly here, and to `team-lead`, rather than either hiding it or unilaterally deciding it doesn't
matter.

**RED/GREEN:** `resolveSourceClaudeConfigDir` — 3 new tests, GREEN (new export, did not exist before).
Integration suite `AgentExecutor — Finding 1 … claude CLAUDE_CONFIG_DIR isolation` — 8 new tests
(non-claude def is a no-op; scratch dir staged + set on env for `claude`; not the real
`~/.claude`-derived path; `.credentials.json` copied when present; accepted no-op when absent;
`AGENT_SPAWN_FAILED` on `mkdtemp` rejection; cleanup on child close; run-id sanitized into the mkdtemp
prefix) — all GREEN. Full `packages/daemon` suite: **978/978 passed**, no regressions. RED was
structural for both blocks (the referenced exports/behavior did not exist prior to this change,
matching this exact package's own precedent for `prepareCodexHomeIfNeeded`, which likewise has no
standalone pre-existing-vs-broken RED capture in this test file) rather than a separately captured
failing run before/after a revert — flagging this so it isn't read as a stronger RED proof than it is.

## Packages rebuilt

- `@jini-ai/agent-runtime` (`npm run build`) — clean, `tsc --noEmit` clean before and after.
- `@jini-ai/daemon` (`npm run build`) — clean, `tsc --noEmit` clean before and after.
- Confirmed Tovu's symlinked `node_modules/@jini-ai/{agent-runtime,daemon}` resolve to the rebuilt
  `dist/` (both are real symlinks into `/Users/la/Programming/Jini/packages/*`) and that the new
  symbols are present in the compiled output (`disallowedTools` in `claude.js`/`types.d.ts`,
  `resolveSourceClaudeConfigDir`/`prepareClaudeConfigDirIfNeeded` in `agent-executor.js`).
- Tovu root `tsc -p tsconfig.json --noEmit` — clean against the rebuilt packages.
- Did **not** run `pnpm -r build` anywhere.

## Daemon restart

**Required, and not performed** (explicitly forbidden by the dispatch). The rebuilt `dist/` is on
disk and Tovu's symlinks resolve to it, but a long-running Node process holds its modules in memory
from when it started — neither Finding 1's isolation nor Finding 2's tool restriction takes effect on
a live run until the agent daemon process is restarted. Per the note above, land the credential
decision (Finding 1's residual item) before that restart, or the first restart will silently drop the
assistant's login on this machine.

Note also: editing `apps/website/src/server/inbound/assistant/agent-daemon-server.ts` and
`assistant-system-overlay.ts` directly is a save under `apps/website/src` — per this repo's own
documented behavior, the tsx-watch API process reloads on such a save and the agent daemon (its
child) respawns automatically (~3s) as a *pre-existing, expected side effect of the dev server's own
file watcher*, not a restart I issued myself. If a dev server happens to be running, that respawn
already picked up the Tovu-side changes (`disallowedTools` wiring); it would **not** pick up the
Jini-side dist rebuild content differently than before, since the daemon package itself needs its own
process restart to reload — which is the one described above as not performed.

## Files changed

Jini:
- `packages/agent-runtime/src/types.ts` — `RuntimeBuildOptions.disallowedTools`/`.allowedTools`.
- `packages/agent-runtime/src/defs/claude.ts` — emits the two new flags.
- `packages/agent-runtime/src/defs/__tests__/claude.test.ts` — +5 tests.
- `packages/daemon/src/agent-executor.ts` — both findings' mechanisms.
- `packages/daemon/src/__tests__/agent-executor.test.ts` — +11 tests (3 `resolveSourceClaudeConfigDir`, 8 Finding-1 integration).
- `packages/daemon/src/__tests__/agent-executor-helpers.test.ts` — +3 tests.

Tovu:
- `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts` — `ASSISTANT_DISALLOWED_TOOLS` + doc update (BASH_PROHIBITION_BLOCK/BASH_GUIDANCE_BLOCK text untouched).
- `apps/website/src/server/inbound/assistant/agent-daemon-server.ts` — imports + wires `disallowedTools` into `agentExecutor.run()`.
- `apps/website/src/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts` — +2 tests.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts` — new file, 2 tests.

## Architecture Audit

- **Status: PASS.** Mechanism lives in `@jini-ai/agent-runtime`/`@jini-ai/daemon` (shared, no Tovu
  opinion baked in — `disallowedTools`/`allowedTools`/`claudeConfigDirIsolation` are all
  caller-supplied); Tovu's own policy (`ASSISTANT_DISALLOWED_TOOLS`, evidence-derived) lives in
  Tovu's own `assistant-system-overlay.ts`. `BASH_PROHIBITION_BLOCK` text untouched. No `.env`
  modification. No credential value read or reproduced anywhere in this session (grepped variable
  NAMES only). No `serve-command*.integration.test.ts` run. No files touched outside this scope
  (`apps/admin/src`, embeds/resolver-service, `mcp-federation/`, `cli/__tests__/` all untouched).
  Databases opened read-only only (`chat.db` via `?mode=ro`), nothing written.

## Not done / explicitly out of scope

- The residual macOS-Keychain-login gap above is a product/ops decision (which credential to
  provision), not something I could or should resolve unilaterally — routing back for that call.
- Did not restart the daemon (forbidden) — GREEN evidence above is unit/integration-test-level, not a
  live end-to-end run against the restarted process.

## Follow-up status check (same day, after team-lead asked for a precise commit/state report)

Both trees were already clean at the time of this check — `git status --short` on the touched paths
in both Tovu and Jini returns nothing; everything below was already committed before this message,
not newly committed in response to it.

**1. Environment isolation — DONE (mechanism), auth explicitly VERIFIED not to silently carry over.**
Not partial: `prepareClaudeConfigDirIfNeeded`/`prepareClaudeConfigDirForRun` in
`Jini/packages/daemon/src/agent-executor.ts` are wired unconditionally into `run()` for every
`def.id === 'claude'` run, `computeChildEnv` sets `CLAUDE_CONFIG_DIR` on the spawned child, and
cleanup is wired into the existing `cleanupStagedFiles` closure. 8 integration tests + 3 unit tests
pass, plus the full 978-test `packages/daemon` suite with no regressions.

**Did I prove login still resolves? Yes, and the proof is a real gap, stated plainly, not implied
away:** I ran `claude auth status` live against this dev machine three ways — real `HOME` (control,
`loggedIn: true`), real `HOME` with only `CLAUDE_CONFIG_DIR` swapped to a scratch dir
(`loggedIn: false`), and fake `HOME` plus scratch `CLAUDE_CONFIG_DIR` (`loggedIn: false`). I then
confirmed via Anthropic's own docs (fetched live, code.claude.com/docs/en/authentication) why:
"Claude Code... keys the macOS Keychain entry to that directory too, so a session with a different
CLAUDE_CONFIG_DIR reads a different entry." So on THIS host, isolating `CLAUDE_CONFIG_DIR` with
nothing else changed **does** break login — I did not assume the fix was safe, I disproved the naive
version first. I also grepped `agent-daemon-server.ts` and confirmed Tovu passes **no**
`credentialEnv`/`ANTHROPIC_API_KEY` today, so the assistant currently authenticates purely by
inheriting the operator's personal Keychain session — exactly the leak Finding 1 describes, and
exactly what stops working once isolated. The code mitigates the *portable* case (best-effort copies
a real `.credentials.json` when the source config dir has one — Linux/Windows/Keychain-locked-macOS)
but does **not** attempt to extract a live macOS Keychain secret itself (out of scope, and conflicts
with "never read/reproduce credential values"). **Net: the isolation is real and unconditional; on
this specific machine, the assistant will run unauthenticated the moment the daemon restarts, until
Tovu is given a dedicated `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` via the already-existing
`credentialEnv` path.** That is a provisioning decision for the owner/team-lead, not something I
resolved myself.

**2. Tool restriction — DONE, mechanism and policy both landed.**
`RuntimeBuildOptions.disallowedTools`/`allowedTools` (agent-runtime) → `claude.ts` `buildArgs` emits
`--disallowedTools`/`--allowedTools` → `AgentExecutorRunInput.disallowedTools`/`allowedTools`
(daemon) → Tovu's `ASSISTANT_DISALLOWED_TOOLS` passed unconditionally in `agent-daemon-server.ts`'s
`agentExecutor.run()` call. Flag names verified against the installed CLI's own `-p --help`; enforcement
verified live (`--disallowedTools Bash` under `--permission-mode bypassPermissions` actually left the
spawned session unable to call Bash).

**Was the list derived from actual usage?** Yes — read-only (`file:...?mode=ro`) query of
`sites/tovu-com/chat.db`'s `ai_chat_messages.events_json`, parsing every `tool_use` block across all
32 stored admin-chat runs. Observed: `mcp__jini__search_tools`/`describe_tool`/
`execute_delegated_tool`/`execute_readonly_delegated_tool` (96/62/62/12 calls, plus unprefixed
variants), `ToolSearch` (44), `Read` (16), Tovu's own catalog (`assistant_ask_choice`, `seo_*`,
`media_*`, `content_post_search`, `custom_credential_list`, …), and federated `mcp__higgsfield__*`.
**Zero** occurrences of `Bash`, `Edit`, `Write`, `Task`, any `Cron*`, `EnterWorktree`/`ExitWorktree`,
`RemoteTrigger`, or `Workflow` — exactly the set now in `ASSISTANT_DISALLOWED_TOOLS`, matching the
security report's own suggested list. `Read`/`ToolSearch` and Tovu's own tool names were deliberately
left off the deny list (real observed use).

**3. Packages rebuilt:** `@jini-ai/agent-runtime` and `@jini-ai/daemon` only, each via that package's
own `npm run build` (never `pnpm -r build`). `tsc --noEmit` clean before and after in both, and in
Tovu's own root tsconfig. Confirmed Tovu's symlinked `node_modules/@jini-ai/{agent-runtime,daemon}`
resolve to the rebuilt `dist/` and that the new exports are present in the compiled output.

**4. Daemon restart:** Required, not performed (forbidden by this dispatch's scope). Neither fix is
live until the agent daemon process restarts and re-`require`s the rebuilt dist. **Do not restart
before the credential decision in item 1 above is made** — the first restart after this lands will
otherwise silently drop the assistant's login on this machine.

**5. Commits (already made, both trees clean now):**
- Jini `fa1afc58edcea9648bd8e0570b5df7e9cf2b00ee` — `packages/agent-runtime/src/{types.ts,defs/claude.ts,defs/__tests__/claude.test.ts}`, `packages/daemon/src/{agent-executor.ts,__tests__/agent-executor.test.ts,__tests__/agent-executor-helpers.test.ts}`.
- Tovu `d2bb86296d83a90b59a5185c29fdad5cc3078b45` — `apps/website/src/server/inbound/assistant/{assistant-system-overlay.ts,agent-daemon-server.ts}` and their tests, plus this report.

**6. Next action if continuing:** get a decision from the owner on provisioning a dedicated
`ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` for the assistant surface (via `credentialEnv`) before
anyone restarts the agent daemon, since that is the one remaining step between "mechanism landed" and
"isolation fully closed with no login regression."
