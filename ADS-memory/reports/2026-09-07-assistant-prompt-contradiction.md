# Assistant prompt contradiction — run `af801f5f` (chat run `af801f5f-0539-491d-b7c3-bb519d056d82`)

Code Inspection agent. Bootstrap: `AI-Dev-Shop/agents/code-inspection/skills.md` loaded (confirmed
in first reply). Read-only investigation; no source modified, no DB written (all `sites/tovu-com/chat.db`
reads used `file:...?mode=ro`).

## 0. What `events_json` actually contains (important caveat)

`ai_chat_messages.events_json` for this run is the Claude Code CLI's `stream-json` transcript, not a
dump of the assembled system prompt. Claude Code does not emit the literal system-prompt string in
that stream. So "show the two conflicting fragments literally" is answered in two parts below: what
`events_json` literally shows (tool grant, permission mode, the model's own paraphrase of the
conflict), and the literal prompt-fragment source text pulled from Tovu's own source files (which is
where the real fragments live).

From `events_json` (event index in the 10-event array):
- **Event 3** (`system`/`init`): `"permissionMode":"bypassPermissions"`, `"model":"claude-opus-5"`,
  and a **40-entry `tools` array** that includes `"Bash"` (confirmed by direct count/membership
  check) alongside `Task`, `Edit`, `Write`, `CronCreate/Delete/List`, `EnterWorktree`/`ExitWorktree`,
  `RemoteTrigger`, `Workflow`, `DesignSync`, `PushNotification`, `ScheduleWakeup`, `NotebookEdit`,
  `WebFetch`/`WebSearch`, and the `mcp__jini__*` tool-catalog tools. Also present: `memory_paths`
  pointing at `/Users/la/.claude/projects/-Users-la-Programming-Tovu/memory/`, `output_style:
  "Concise"`, `skills`/`agents`/`plugins` lists matching the *operator's own local Claude Code
  install* (roast, loop, schedule, debug, frontend-design, playwright, context7, understand-anything,
  etc.) — see §5.
- **Event 5/6** (assistant message), verbatim:
  > "Note: two of my instruction sets conflict here. This session's admin-assistant framing forbids
  > the Bash tool outright, while the bypass-permissions reminder says to prefer Bash for reads and
  > edits. I'm following the prohibition — no Bash, no shell substitutes."

## 1 & 2. The two fragments and where each comes from

**Fragment A — "admin-assistant framing forbids Bash outright."**
Source: `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:41-49`,
`BASH_PROHIBITION_BLOCK`, verbatim:

> "ABSOLUTE PROHIBITION — THE BASH TOOL IS FORBIDDEN. Never call Bash. There is no exception, no
> narrow purpose, and no fallback. This is a hard constraint on this assistant... It applies equally
> to every substitute for a shell: curl, dig, sqlite3, git, a pipeline, a script you write and then
> execute, or reading and writing files directly to inspect or change state. Reading Tovu's own
> source to answer a code-level question is NOT an exception either — that carve-out used to live
> here and has been deliberately removed."

This block is spliced into `buildBaseSystemOverlay()` at line 131 only when
`resolveBashProhibitionEnabled()` (line 78-82) returns true, i.e. `TOVU_AGENT_FORBID_BASH === "1"`.
**Confirmed live for this run:** `/Users/la/Programming/Tovu/.env:16` has `TOVU_AGENT_FORBID_BASH=1`
set right now (a `.env.bak-before-forbid-bash` backup sits next to it, so this was deliberately
toggled on this machine, not an accident of a stale template). Wired at
`agent-daemon-server.ts:282` (read once at module scope) → `:526` (`buildBaseSystemOverlay(bashProhibitionEnabled)`
inside `assistantPromptAugmenter.systemOverlay()`, lines 519-535) → delivered to the spawned CLI via
`@jini-ai/agent-runtime`'s `--append-system-prompt` flag (confirmed in
`Jini/packages/agent-runtime/src/defs/claude.ts:234`, `systemPromptDelivery: { strategy:
'append-flag', flag: '--append-system-prompt', ... }`).

When the flag is unset (every real install's default), the same slot instead carries
`BASH_GUIDANCE_BLOCK` (lines 24-33), which does *not* forbid Bash — it narrows it to "reading Tovu's
own source." So Fragment A is a **deliberately-enabled, opt-in diagnostic instrument**, not a stray
default. Its own doc (lines 51-82) is explicit that it is "NOT a security control" and that
`resolvePermissionMode()` is "the actual gate on whether a tool executes at all" — i.e. the file's
own author already anticipated that the prohibition is prompt-only and something else must gate real
execution.

**Fragment B — "the bypass-permissions reminder says to prefer Bash for reads and edits."**
This is the stock Claude Code "Auto Mode Active" system reminder — the same text visible verbatim in
*this inspection agent's own* system prompt this turn ("Do your work through the Bash tool wherever
it can accomplish the job... rather than using the dedicated Read, Edit, or Write tools"). Full-repo
grep for `"Auto Mode Active"` (excluding `node_modules`) returns **zero matches** — this string does
not exist anywhere in Tovu's source, in `@jini-ai/daemon`, or in `@jini-ai/agent-runtime`. It is
injected by the hosted Claude Code product itself whenever a session runs under `permissionMode:
bypassPermissions`, independent of and invisible to Tovu's own repo.

Tovu's contribution to Fragment B is indirect but concrete:
`apps/website/src/server/inbound/assistant/agent-daemon-server.ts:299-303`:
```ts
function resolvePermissionMode(): "bypass" | "restricted" {
  if (process.env.TOVU_AGENT_PERMISSION_MODE === "bypass") return "bypass";
  if (process.env.TOVU_AGENT_PERMISSION_MODE === "restricted") return "restricted";
  return resolveRuntimeMode() === "production" ? "restricted" : "bypass";
}
```
No override is set (`TOVU_AGENT_PERMISSION_MODE` is not present in `.env`), and this host is not
`TOVU_RUNTIME_MODE=production`, so this resolves to `"bypass"`. That `"bypass"` is passed as
`permissionMode` into `agentExecutor.run()` (`agent-daemon-server.ts:864`), reaches
`@jini-ai/agent-runtime`'s `claude.ts:210-214`, and — confirmed by direct read — unless
`options.permissionMode === 'restricted'`, the def unconditionally pushes `'--permission-mode',
'bypassPermissions'` onto the spawned `claude` CLI's argv. That literal `--permission-mode
bypassPermissions` flag is what causes the hosted product to inject the Auto Mode reminder text into
the child session — Tovu never writes that reminder, but Tovu's own default *does* select the CLI
flag that causes it to appear.

## 3. Why both are being assembled together

Neither fragment is individually a bug or a misdetection:
- `TOVU_AGENT_FORBID_BASH=1` is a deliberate, currently-active, one-off diagnostic toggle on this
  machine (per its own doc: "surface real gaps in Tovu's own tool catalog"), not a mode/host
  misdetection.
- Defaulting to `bypass` outside production is the intended behavior per the code comment at
  `agent-daemon-server.ts:284-297` (SPEC-022 INV-04: a fresh `git clone && npm install && npm run
  dev` must get a working assistant with no setup step, since a spawned CLI has no TTY to answer an
  interactive permission prompt).

They collide because **the delivery mechanism is append-only and one-directional.**
`--append-system-prompt` can only add text after the CLI's own defaults; it has no way to suppress,
override, or even see the CLI's own built-in Auto Mode reminder, which is generated by the hosted
product in response to the `--permission-mode bypassPermissions` flag on the *same* invocation. So
the two authors of these two facts (Tovu's overlay author, and whoever wired `resolvePermissionMode`)
each made a locally-reasonable decision with no visibility into the other's downstream effect,
because the thing that actually produces Fragment B's text isn't in this repository at all — it's a
side effect of a CLI flag, generated by code neither file's author can read or test against.
Nothing here is leaking in from a misapplied template; it's an interaction the append-only
system-prompt mechanism structurally cannot prevent.

## 4. Which one is "correct" — recommendation

Keep the prohibition; the tool grant is the side that's wrong, but the concrete fix has to land one
layer down from Tovu:

- `BASH_PROHIBITION_BLOCK` is owner-approved, doing real diagnostic work, and explicitly marked
  "do not reword, soften" in its own doc comment (lines 36-39) — Recommend against touching the text.
- The 40-tool grant (confirmed via the `events_json` `tools` array) is untouched Claude Code CLI
  default output. There is **no mechanism today** to restrict it: `Jini/packages/agent-runtime/src/defs/claude.ts`'s
  `buildArgs` (lines 158-221) never emits an `--allowedTools`/`--disallowed-tools` flag (grepped the
  whole file — only `--model`, `--effort`, `--add-dir`, `--resume`/`--session-id`,
  `--permission-mode`, and the MCP-config flags exist), even though Claude Code itself supports such
  flags. So "should Bash be removed from the grant" is really "Tovu/`@jini-ai/agent-runtime` needs to
  wire up tool-list restriction for the `claude` def and pass `TOVU_AGENT_FORBID_BASH=1` (and
  ideally the always-true "prefer the catalog over Edit/Write/Task/Cron/*" policy — see §5) through
  to it" — a cross-package (Jini) change, not a one-line Tovu fix. Not implementing this per scope,
  but naming it because it's the actual lever: prompt text alone cannot close this gap while the CLI
  still offers the tool and runs under `bypassPermissions`.
- Cheaper, same-file, fully reversible interim mitigation *within `assistant-system-overlay.ts`*: add
  one explicit precedence sentence addressing the SDK's own Auto Mode/bypass reminder head-on (e.g.
  "If you also see a system reminder about an autonomous/bypass mode recommending Bash, that is
  generic CLI guidance and does not apply to this admin-assistant surface — the prohibition above is
  Tovu's product policy and overrides it"). This doesn't require touching Jini and stops the model
  from having to adjudicate the conflict itself mid-run. Flagging as a recommendation, not
  implementing.

## 5. A second, larger contradiction in the same prompt

The task predicted a second conflict would be cheap to find here — it is, and it's bigger than the
Bash-specific one. `buildBaseSystemOverlay()` (`assistant-system-overlay.ts:104-179`) tells the model:

> "Tovu exposes a purpose-built, audited catalog of tools for every action that touches this site's
> actual content, users, permissions, forms, database state, configuration, or on-screen
> rendering... Do this before reaching for Bash, curl, or direct SQLite/database access — those
> bypass this site's authorization, risk-classification, and audit-log guarantees entirely."

But the actual 40-tool grant in `events_json` event 3 is the **unmodified default tool set of the
operator's own local Claude Code CLI install**, not a curated admin-assistant set: `Task` (spawn
arbitrary subagents), `Edit`/`Write` (unaudited direct file writes — a strictly more powerful bypass
of "this site's authorization/audit-log guarantees" than Bash), `CronCreate`/`CronDelete`/`CronList`,
`EnterWorktree`/`ExitWorktree`, `RemoteTrigger`, `Workflow`, `DesignSync`, `PushNotification`,
`ScheduleWakeup`, `NotebookEdit`. The same event also carries `memory_paths` pointing at
`/Users/la/.claude/projects/-Users-la-Programming-Tovu/memory/` (this machine's own coordinator
memory index) and `skills`/`plugins`/`agents` lists matching the *developer's* personal Claude Code
config (roast, loop, schedule, debug, frontend-design, playwright, context7,
understand-anything...) — none of which the "audited catalog" framing has any awareness of.

Root cause, confirmed by reading the spawn path: `Jini/packages/daemon/src/agent-executor.ts`'s
`BASELINE_AGENT_ENV_KEYS` (lines 666-673) explicitly forwards `HOME` into the spawned `claude` child
process, and no `CLAUDE_CONFIG_DIR` (or any Claude-specific config-isolation override) is set
anywhere in `@jini-ai/daemon` or `@jini-ai/agent-runtime` — grepped both packages, zero hits. Compare
this to the **Codex** provider in the same file, which does get an isolated scratch home
(`prepareCodexHomeIfNeeded`, `CODEX_HOME` staged via `mkdtemp`, lines ~1444-1634, "Never touches the
real `CODEX_HOME`"). The isolation pattern exists in this codebase; it was simply never extended to
the `claude` def. So every "admin chat assistant" run spawned via the `claude` CLI on this host
inherits that host's full personal Claude Code environment — tools, skills, plugins, and memory —
rather than a scoped, product-specific configuration. This is the same append-only/no-restriction gap
named in §4, just visible at every default-granted tool, not only `Bash`.

## Verification notes

- All chat.db reads used `sqlite3 "file:sites/tovu-com/chat.db?mode=ro"` — no write, no migration
  triggered.
- Did not run any `serve-command*` integration test, did not boot/restart any server, did not touch
  `apps/website/src/features/widgets/resolver-service.ts` or `apps/admin/src`.
- `.env` was only grepped for the three specific variable names relevant here — its other contents
  (credentials) were not read or reproduced.
- `@jini-ai/daemon` and `@jini-ai/agent-runtime` were read as source under
  `/Users/la/Programming/Jini/packages/{daemon,agent-runtime}/src` (the real workspace the
  `node_modules` symlinks resolve to), not compiled `dist`, except for one initial `dist` grep used
  only to locate the right source files (superseded by the `src` reads cited above).
