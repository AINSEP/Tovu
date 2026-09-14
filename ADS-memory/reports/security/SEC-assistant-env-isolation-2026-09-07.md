# SEC-assistant-env-isolation-2026-09-07 — spawned `claude` child inherits operator's real environment and tool grant

Security agent. Bootstrap: `AI-Dev-Shop/agents/security/skills.md` loaded (confirmed in first reply).

## Role-boundary note (read first)

The dispatch for this task (from `team-lead`) asked for RED tests, source edits, package rebuilds,
and a git commit. `AI-Dev-Shop/agents/security/skills.md` — the file the dispatch itself required me
to bootstrap from — is explicit and unambiguous about this role's boundary:

> "Nothing gets patched without human approval." / Workflow step 7: "Report to Coordinator. Do not
> implement fixes." / Guardrail: "Never auto-patch — surface findings only, humans decide what ships."

`team-lead` is a peer agent, not the human operator, and no agent message is authorization to change
what I do outside my role definition. So this report does the analysis, verification, severity
classification, and concrete mitigation the skills.md Output Format calls for — it does not implement
Task 1 or Task 2. Both are scoped as findings below with enough detail (including which existing
in-repo pattern to reuse) for a Programmer agent to implement once a human signs off. I did not edit,
write, rebuild, or commit anything in `Jini/` or `Tovu/`; every claim below was checked read-only
against current source.

## Scope

Follow-up verification of `ADS-memory/reports/2026-09-07-assistant-prompt-contradiction.md` §5,
scoped to the two gaps it named but explicitly did not implement:
1. The spawned `claude` child process's config/environment isolation (or lack of it).
2. The runtime's lack of a tool-restriction flag, which is why `BASH_PROHIBITION_BLOCK` is prompt-only.

All reads were source under `/Users/la/Programming/Jini/packages/*/src` (the real workspace the
Tovu `node_modules` symlinks resolve to) and Tovu's own `apps/website/src`. No file was written, no
package rebuilt, no DB touched, no server restarted, no `serve-command*` integration test run.

## Attack surface / trust boundary

Entry point: any Tovu admin-chat message that the daemon routes to a `claude`-CLI-backed agent run
(`agent-daemon-server.ts` → `@jini-ai/daemon`'s `agentExecutor.run()` → `@jini-ai/agent-runtime`'s
`claude.ts` def → `child_process.spawn`). The trust boundary that matters here is not
attacker-vs-Tovu — it's **product-intent-vs-actual-grant**: the admin operating Tovu is told (via
`assistant-system-overlay.ts`'s `buildBaseSystemOverlay`) that the assistant has "a purpose-built,
audited catalog of tools," and that framing is the basis on which an operator decides what's safe to
ask it to do or leave unsupervised. The two findings below are about that framing being false today,
which matters for authz-adjacent reasoning even though no external attacker input is involved yet:
a model given real Bash/Edit/Write/Task and no restriction is one bad completion away from acting
outside the "audited catalog" that both the product copy and the operator's mental model assume.

## Findings

### Finding 1 — Spawned `claude` child inherits the operator's real Claude Code config/environment (no isolation)

- **Severity: High**
- **Type:** Privilege/scope leak via unisolated subprocess environment (CWE-668: Exposure of
  Resource to Wrong Sphere)
- **Affected component and files:**
  - `Jini/packages/daemon/src/agent-executor.ts:660-695` (`BASELINE_AGENT_ENV_KEYS`, `buildAgentEnv`)
  - `Jini/packages/agent-runtime/src/defs/claude.ts` (`claude` def — no config-dir isolation wired)
  - Contrast: `Jini/packages/daemon/src/agent-executor.ts:~3279-3320` (`prepareCodexHomeIfNeeded`) —
    the Codex def already gets this treatment
  - Contrast: `Jini/packages/platform/src/sandbox-env.ts:285` — a *different*, apparently unused (by
    this spawn path) mechanism already sets `env.CLAUDE_CONFIG_DIR` for some other sandboxed-runtime
    surface, confirmed live in that package's own test (`sandbox-env.test.ts:234`)
- **Verified, current state (re-checked, not inherited from the prior report):**
  - `buildAgentEnv` (`agent-executor.ts:685-695`) is a genuine deny-by-default allowlist — it does
    *not* forward `process.env` wholesale (SEC-001's own fix, per its doc comment). It forwards only
    the fixed `BASELINE_AGENT_ENV_KEYS` list: `PATH, HOME, USERPROFILE, TMPDIR, TEMP, TMP, SHELL,
    LANG, LC_ALL, LC_CTYPE, USER` (+ 4 Windows-only no-ops elsewhere), plus this run's explicitly
    delegated credential(s).
  - `HOME` is on that list, forwarded verbatim. Grepped both `@jini-ai/daemon/src` and
    `@jini-ai/agent-runtime/src` for `CLAUDE_CONFIG_DIR`: zero hits in either package. The `claude`
    CLI's own config resolution (skills, plugins, agents, MCP server list, memory-path index,
    settings) is `$HOME/.claude/` unless `CLAUDE_CONFIG_DIR` overrides it — so with `HOME` passed
    through unmodified and no override set, the spawned child reads the **operator's real, personal**
    Claude Code config, not a Tovu-scoped one.
  - Confirmed by a real run's transcript (prior report's Event 3): `memory_paths` pointed at
    `/Users/la/.claude/projects/-Users-la-Programming-Tovu/memory/` and the `skills`/`plugins`/
    `agents` lists matched this machine's personal install (roast, loop, schedule, frontend-design,
    playwright, context7, understand-anything, …) — none of which the "audited catalog" framing in
    `assistant-system-overlay.ts` has any awareness of, and none of which a second operator on a
    different machine would get (making the assistant's behavior host-dependent, not product-defined).
  - The isolation *pattern* already exists in this exact file for a sibling provider: Codex gets a
    freshly `mkdtemp`'d scratch `CODEX_HOME`, a purpose-built `config.toml` written into it, and
    cleanup afterward (`prepareCodexHomeIfNeeded` / `stageCodexHome`, ~lines 1622-1670 and
    3279-3320). It was never extended to the `claude` def — this is a coverage gap in an existing
    control, not a missing mechanism.
  - `@jini-ai/platform/sandbox-env.ts:285` shows `CLAUDE_CONFIG_DIR` is already a known,
    tested env var in this codebase for exactly this purpose, just not wired into `agent-executor`'s
    spawn path for the `claude` def — reinforces that the correct fix is "reuse an existing lever,"
    not "invent one."
- **Exploit / impact scenario:** No malicious actor is required for real impact today: every
  operator who runs Tovu on a machine with their own Claude Code install unknowingly grants the
  admin-chat assistant that operator's full personal tool grant (per the referenced transcript: a
  40-entry set including `Task`, `Edit`, `Write`, `CronCreate/Delete/List`, `EnterWorktree`/
  `ExitWorktree`, `RemoteTrigger`, `Workflow`, `NotebookEdit`, `WebFetch`/`WebSearch`) and read
  visibility into that operator's personal memory index and skills/plugins list — none of which Tovu
  intended to expose to the model or asked the operator to consent to. Because the *product* framing
  ("purpose-built, audited catalog") tells the operator this can't happen, an operator has no reason
  to expect a chat request could, in principle, trigger `CronCreate`, spawn a `Task` subagent, or use
  `Edit`/`Write` for unaudited direct file writes outside Tovu's own tool-audit path. This is a
  multi-tenant/shared-host concern too: on a machine used for both Tovu dev and other Claude Code
  work, one operator's personal skills/memory become reachable context for a different admin's chat
  session with no isolation between them.
- **Mitigation (not implemented — for the Programmer agent + human sign-off):** Give the `claude`
  def the same treatment `prepareCodexHomeIfNeeded` gives Codex: stage a fresh, `mkdtemp`'d, run-scoped
  directory, set `CLAUDE_CONFIG_DIR` to it in the child's env (reusing the constant already named in
  `packages/ui/src/features/execution/constants.ts:194` and the pattern already proven in
  `packages/platform/src/sandbox-env.ts:285`), write only the minimal config Tovu needs into it
  (see pass-through list below), and remove the directory in the same place Codex's scratch home is
  cleaned up. Before cutting anything, enumerate what must still reach the child:
  - Auth/login state — the existing `USER` comment at `agent-executor.ts:669-674` documents by
    bisection that `claude` needs `USER` (and, by extension, whatever credential store `HOME`
    currently exposes, e.g. keychain-backed auth) to avoid "Not logged in." Any isolation must
    preserve login capability — either by pointing the scratch config dir's auth file at a copy of
    the real credential, or by confirming credential resolution doesn't route through
    `CLAUDE_CONFIG_DIR` at all (it may be keychain/`ANTHROPIC_API_KEY`-based rather than
    config-dir-based — verify before landing, this is exactly the kind of thing that silently breaks
    login if assumed rather than checked, per this file's own "no silent behavior changes" /
    "verify before affirming architecture idea" standing practice).
  - `output_style`/model/effort selection currently comes through CLI flags (`--model`, `--effort`)
    in `claude.ts`'s `buildArgs`, not the config dir — should be unaffected.
  - Whatever MCP servers Tovu *does* want the child to have (the daemon's own `mcp__jini__*`
    catalog, delivered via `externalMcpInjection: 'claude-mcp-json'` and `.mcp.json` written to cwd)
    must still load — confirm the scratch config dir doesn't shadow or conflict with that
    already-separate delivery mechanism.
  - `memory_paths` and any project-scoped `.claude/` settings **must not** carry over from the
    operator's real `HOME` — that's the leak this fix closes. If a curated project-scoped memory or
    settings should exist for the assistant, write it explicitly into the scratch dir; don't
    inherit it implicitly.
- **Verification steps once implemented:** RED — a test asserting the spawned child's resolved
  `CLAUDE_CONFIG_DIR`/effective config differs from the real `$HOME/.claude`, currently failing
  (env is unset today, so it inherits `HOME`). GREEN — same assertion passing once the scratch dir is
  wired, plus a live-run check (transcript or direct env inspection) that `skills`/`plugins`/
  `memory_paths` in a fresh run no longer match the operator's personal install, and that login/model
  selection/MCP tool access still work end to end.
- **Human sign-off required: yes** (changes what a live spawn inherits; must not regress login).

### Finding 2 — No tool-restriction flag wired for the `claude` def; `BASH_PROHIBITION_BLOCK` is prompt-only, not enforced

- **Severity: High**
- **Type:** Missing authorization/least-privilege control (CWE-284: Improper Access Control) —
  policy expressed only in natural-language prompt text with no corresponding enforcement mechanism
- **Affected component and files:**
  - `Jini/packages/agent-runtime/src/defs/claude.ts:158-221` (`buildArgs`)
  - `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:41-49` (`BASH_PROHIBITION_BLOCK`)
  - `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:282,299-303,526,864`
    (`TOVU_AGENT_FORBID_BASH` wiring, `resolvePermissionMode`)
- **Verified, current state:** Re-read `buildArgs` in full (lines 158-221 above). It emits `-p`,
  `--input-format`, `--output-format`, `--verbose`, optionally `--include-partial-messages`,
  `--model`, `--effort`, `--add-dir`, `--resume`/`--session-id`, and — unconditionally unless
  `options.permissionMode === 'restricted'` — `--permission-mode bypassPermissions`, plus the MCP
  config flags. No `--allowedTools`/`--disallowedTools` (or any equivalent) is ever emitted. Grepped
  `agent-runtime/src` for `allowedTools|disallowedTools|disallowed-tools|allowed-tools`: zero hits.
  This confirms the prior report's finding is still accurate today. `BASH_PROHIBITION_BLOCK`'s own
  doc comment (`assistant-system-overlay.ts:58-61`) already states in-repo: "This is NOT a security
  control... `resolvePermissionMode()` is the actual gate on whether a tool executes at all" — but
  `resolvePermissionMode()` (`agent-daemon-server.ts:299-303`) only chooses between Claude Code's own
  `bypassPermissions` and its interactive default; it has no per-tool granularity and cannot itself
  remove `Bash` (or `Edit`/`Write`/`Task`/`Cron*`) from the grant. So today there is a real gap
  between "the code's own comment says something else is the actual gate" and that gate actually
  existing at tool granularity — it doesn't yet.
- **Exploit / impact scenario:** `TOVU_AGENT_FORBID_BASH=1` (confirmed set in this host's `.env`,
  not modified or reproduced here) can only ever produce a prompt instruction asking the model not
  to call Bash. Under `bypassPermissions`, the CLI will still execute a Bash call if the model
  makes one — a prompt injection reaching the assistant (a maliciously crafted piece of content the
  assistant reads and treats as instruction, or simply a model failure to follow the prohibition
  under pressure) has no runtime backstop. The same is true, and higher-impact, for `Edit`/`Write`
  (unaudited direct file writes bypassing Tovu's audit-log guarantees) and `Task` (arbitrary
  subagent spawn) — none of which the current overlay even asks the model to avoid; only Bash has
  prompt-level guidance at all. Given Finding 1's env leak, a Task-spawned subagent would itself
  inherit the same unisolated environment, compounding both findings.
- **Mitigation (not implemented — for the Programmer agent + human sign-off):** Wire
  `--allowedTools`/`--disallowedTools` (verify exact current flag names/syntax against the installed
  `claude` CLI version before landing — flag names have changed across CLI releases, per this repo's
  own probe-gating pattern for `--include-partial-messages`/`--effort`) through `buildArgs`, driven
  by a new field on `RuntimeBuildOptions` (or equivalent) rather than a hardcoded list, so this stays
  a `@jini-ai/agent-runtime`-level *mechanism* and Tovu's own product policy (which tools to actually
  restrict) is supplied by the caller — matching this task's own instruction and this package's
  existing pattern of "runtime provides the lever, the product pulls it" (e.g. `permissionMode`,
  `systemPromptOverlay` are both caller-supplied options already). Do **not** hardcode Tovu's
  Bash-forbid opinion into the shared runtime package — Codex/Gemini/other defs and other products
  built on `@jini-ai/agent-runtime` must not inherit Tovu-specific tool policy. Once wired, Tovu can
  pass a real `disallowedTools: ['Bash']` (and, per the audit-log-guarantee framing already in
  `assistant-system-overlay.ts`, arguably `Edit`, `Write`, `Task`, `CronCreate`, `CronDelete`,
  `CronList`, `EnterWorktree`, `ExitWorktree`, `RemoteTrigger`, `Workflow` — scoping that expanded
  list is a product decision, not this report's call) alongside `TOVU_AGENT_FORBID_BASH`, making
  `BASH_PROHIBITION_BLOCK` redundant-but-harmless rather than the only enforcement. Per the dispatch's
  own instruction and this block's doc comment, do not remove or reword
  `BASH_PROHIBITION_BLOCK` — retiring it once real enforcement exists is the product owner's call,
  not an automatic consequence of this fix.
- **Verification steps once implemented:** RED — a test asserting `buildArgs`' output argv does not
  contain `--disallowedTools`/`--allowedTools` today (currently true). GREEN — same test asserting
  the exact expected flag and value once a restriction option is passed in, plus (if feasible without
  violating the "don't run `serve-command*` integration tests" constraint) a unit-level check that a
  `claude` CLI invocation built with `disallowedTools: ['Bash']` actually refuses a Bash tool call —
  confirm this against the installed CLI's real flag contract, not assumed syntax.
- **Human sign-off required: yes** (changes actual tool grant on a live assistant surface; scope of
  the restricted list is a product decision).

## Overall threat assessment

Both findings describe the same root gap from the prior investigation — the `claude` def in
`@jini-ai/agent-runtime` was never given the isolation/restriction treatment its sibling `codex` def
already has — surfacing at two different layers: environment (Finding 1) and tool grant (Finding 2).
Neither is exploitable by an external, unauthenticated attacker today (both require already reaching
the admin-chat assistant), but both mean the product's own stated security framing
("purpose-built, audited catalog," "not a security control" comment already in-repo) is currently
inaccurate about what actually gates execution, which is itself a defect in an authorization-adjacent
surface: an operator's risk judgment about what to let the assistant do unsupervised is based on a
false model of its capability. Recommend both be fixed together, since Finding 1's env isolation is
also where a `CLAUDE_CONFIG_DIR`-scoped settings file could eventually carry a default tool
restriction — but Finding 2 does not require waiting on Finding 1 to land first.

## Handoff

Per this role's guardrails, I did not implement, test-write, rebuild, or commit any change. Routing
both findings to Coordinator for a Programmer-agent dispatch once a human has signed off on: (a) the
exact pass-through list for the `claude` scratch config dir, and (b) the exact restricted-tool list
Tovu wants enforced beyond Bash.
