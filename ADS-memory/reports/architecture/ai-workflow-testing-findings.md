# AI-driven workflow testing — findings log

**Purpose:** A durable, running log of bugs found by actually driving Tovu's admin
assistant with natural-language requests (not unit/contract tests, which call tool
handlers directly with fixed args and only verify contract + authorization — they
cannot catch a model failing to invoke the right tool, or bypassing the tool catalog
entirely). Append an entry every time a live AI-driven workflow session surfaces a
real bug, regardless of which agent/session found it. This did not exist before
2026-07-30 — two real bugs (see "Prior bugs" below) were previously only recorded in
commit messages and would have been effectively lost without cross-referencing git
log by hand.

**Format per entry:** date, admin section(s) touched, the natural-language prompt
used, what actually happened, why it matters, status.

---

## Prior bugs (found before this log existed — backfilled for continuity)

### 2026-07-29 — Delegated-tool delivery silently broken for every spawned CLI
- **Where:** Infrastructure underlying every domain's agent tools (Forms + Identity
  were what was being wired when this was found).
- **What happened:** `mcp-injection.ts` never minted a bearer credential for the
  spawned MCP server's daemon callbacks, and `agent-daemon-server.ts` never mounted
  the tool-catalog HTTP routes (`search_tools`/`describe_tool` proxy). Confirmed live
  via direct daemon curls: 401/404 before the fix, 200 after.
- **Why it matters:** Every agent-tool call from every spawned coding-agent CLI was
  silently broken — no tool could ever have been reached, regardless of how well the
  handler itself was built or tested.
- **Status:** Fixed, `f23bbd6`.

### 2026-07-30 (earlier this session) — Every MCP tool call hung with no error
- **Where:** Identity (`identity_user_create` was the reproducing case, but the bug
  was domain-agnostic).
- **What happened:** `resolvePermissionMode()` defaulted to `"restricted"` unless an
  env var was manually set. A spawned agent CLI has no TTY to answer the resulting
  interactive permission prompt, so every permission-gated tool call — not just
  identity's — silently stalled forever with no error surfaced to the user.
- **Why it matters:** A fresh clone with no special setup got an assistant that
  appeared to work (chat pane loads, model responds) but silently failed on every
  actual tool-mediated action.
- **Status:** Fixed, `e86b51f`.

---

## 2026-07-30 (this session, AI-workflow pilot) — Tool catalog trivially bypassed by the assistant's own default behavior

- **Where:** Database section. Prompt: *"What's the current health status of the
  database?"*
- **What happened:** A purpose-built, schema-validated, `none`-risk tool exists for
  exactly this question (`database_get_health`). The assistant never called it.
  Instead, using the selected AI runtime's native Bash tool (runtimes are real
  coding-agent CLIs — Claude Code, Codex, etc. — spawned via
  `@jini-ai/agent-runtime`, with Tovu's domain tools additionally exposed to them
  over MCP, not the only channel available), it ran an 8-step investigation: `ls`,
  grepped source files for health-related code, read `health.ts` /
  `database-recovery.ts` / `status.ts`, curled `/health` and `/readyz` directly, and
  ran **raw, unaudited SQL directly against the live `content.db`** via the
  `sqlite3` CLI — including `PRAGMA integrity_check`, listing all tables, and a
  malformed exploratory query that errored (`SELECT id, status FROM workspaces` —
  `no such column: status`).
- **Why it matters:** This is not a hypothetical gap. The entire value of ADR-049's
  tool-registration discipline — schema validation, independently-authored risk
  classification, `requireToolPermission`/`content.read`/`content.write`
  authorization gates, and the tool-audit-sink event log — assumes the assistant's
  actions flow through that catalog. They don't have to. The same channel that ran
  read-only diagnostic queries here could just as easily run `DELETE FROM posts`
  directly via Bash, bypassing the MCP-UI confirmation gate built this session
  specifically to prevent unconfirmed destructive post/page deletes, with zero
  audit-log visibility into that action ever happening.
- **Status:** **Unresolved, flagged priority #1 by the user (2026-07-30).** Needs a
  design decision, not just a bug fix: is full Bash/repo/DB access an intentional,
  permanent feature of this admin chat surface (in which case the tool catalog is a
  convenience layer, not a safety boundary, and that should be stated explicitly
  somewhere), or should the admin-facing assistant's capabilities be restricted to
  the reviewed tool catalog with Bash access reserved for a genuinely
  developer-only/local surface? No decision made yet — do not build a fix until this
  is resolved, per the same "don't build before scoping" discipline used for the
  Postgres/Supabase question.
