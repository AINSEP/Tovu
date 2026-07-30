# AI-driven workflow testing — solutions log

**Purpose:** A durable record of *solved* problems discovered by actually driving
Tovu's admin assistant with natural-language requests (not unit/contract tests,
which call tool handlers directly with fixed args and only verify contract +
authorization — they cannot catch a model failing to invoke the right tool, or
bypassing the tool catalog entirely). Add an entry only once a fix has actually
landed for a specific AI-tooling issue — not for every test run or every
reproduction of an already-known problem. This did not exist before 2026-07-30;
two real bugs (below) were previously only recorded in commit messages and would
have been effectively lost without cross-referencing git log by hand.

**Format per entry:** date, what was broken, how it was found, the fix, the commit.

---

## Fixed

### 2026-07-29 — Delegated-tool delivery silently broken for every spawned CLI
- **What was broken:** `mcp-injection.ts` never minted a bearer credential for the
  spawned MCP server's daemon callbacks, and `agent-daemon-server.ts` never mounted
  the tool-catalog HTTP routes (`search_tools`/`describe_tool` proxy).
- **How found:** Live daemon curls while wiring Forms + Identity tools: 401/404.
- **Fix:** Mint the credential; mount the routes. Confirmed live: 200 after.
- **Commit:** `f23bbd6`.

### 2026-07-30 — Every MCP tool call hung with no error
- **What was broken:** `resolvePermissionMode()` defaulted to `"restricted"`
  unless an env var was manually set. A spawned agent CLI has no TTY to answer
  the resulting interactive permission prompt, so every permission-gated tool
  call silently stalled forever with no error surfaced.
- **How found:** Live `identity_user_create` call via the admin chat pane hung
  indefinitely.
- **Fix:** Default off `resolveRuntimeMode()` instead — bypass unless
  `TOVU_RUNTIME_MODE=production`.
- **Commit:** `e86b51f`.

---

## Open (tracked here only because it's the active priority — not a running tally of reproductions)

### Tool catalog trivially bypassed by the assistant's own default behavior
Confirmed 4x on 2026-07-30 across read and mutating actions in 2 domains
(database health check, user creation + role assignment, role listing, form
creation) — the spawned CLI has full native Bash/file access alongside Tovu's
tool catalog (exposed only behind 3 generic meta-tools, `search_tools`/
`describe_tool`/`execute_delegated_tool`), and consistently used Bash/raw HTTP
instead of the matching registered tool. Worst instance: self-authenticated as
the seeded site owner via the raw admin login route to create a user, entirely
outside the tool-audit-sink and risk-classification system. Sharpest instance:
the model located and loaded the real tool schemas via `ToolSearch` and *still*
chose the raw-HTTP path — ruling out pure discoverability as the sole cause.

Root cause: no steering exists (`PromptAugmenter.systemOverlay()` is defined in
`@jini-ai/agent-runtime` but never wired into `createAgentExecutor`), and no
tool-restriction mechanism exists in either repo (`RuntimeAgentDef` has no
`disallowedTools`-equivalent field) — full investigation details available via
git history of this file if needed, not duplicated here.

**Not yet fixed.** Once a fix lands, replace this section with a normal "Fixed"
entry.
