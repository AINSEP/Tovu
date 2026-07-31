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

### 2026-07-30 — Tool catalog trivially bypassed by the assistant's own default behavior
- **What was broken:** Confirmed 4x across read and mutating actions in 2 domains
  (database health check, user creation + role assignment, role listing, form
  creation) — the spawned CLI has full native Bash/file access alongside Tovu's
  tool catalog (exposed only behind 3 generic meta-tools, `search_tools`/
  `describe_tool`/`execute_delegated_tool`), and consistently used Bash/raw HTTP
  instead of the matching registered tool. Worst instance: self-authenticated as
  the seeded site owner via the raw admin login route to create a user, entirely
  outside the tool-audit-sink and risk-classification system. Sharpest instance:
  the model located and loaded the real tool schemas via `ToolSearch` and *still*
  chose the raw-HTTP path — ruling out pure discoverability as the sole cause.
- **How found:** Live natural-language prompts via the admin chat pane, watching
  which tools/Bash calls the assistant actually made.
- **Root cause:** No steering existed — `PromptAugmenter.systemOverlay()` was
  defined in `@jini-ai/agent-runtime` but never wired into `createAgentExecutor`.
  The tool catalog's own meta-tool descriptions carry no special weight against a
  capable coding CLI's native, zero-indirection Bash access.
- **Fix:** Wired the seam end-to-end — `RuntimeBuildOptions.systemPromptOverlay`
  (agent-runtime), threaded through `createAgentExecutor`'s new `promptAugmenter`
  option (daemon), consumed by Claude's `buildArgs` via `--append-system-prompt`
  (probe-gated, same pattern as `--effort`/`--include-partial-messages`). Tovu
  supplies the actual instruction text in `agent-daemon-server.ts` (product-specific
  content stays out of the reusable Jini seam, per the seam's own design intent) —
  explicitly names `search_tools`→`describe_tool`→`execute_delegated_tool` as the
  required path for content/user/config actions, and explicitly forbids raw
  DB/HTTP access and self-authentication.
- **Verified live, 4 domains, both read and mutating actions**: database health
  check, user creation + role assignment, redirect creation, draft post creation —
  all four now go through the tool catalog with zero Bash calls touching site
  data. 3 of 4 (database, user creation, post creation) went straight from the
  system instruction to `search_tools` with no exploratory detour at all — the
  fix holds on its own without needing any corroborating context.
- **A real caveat, not just a lucky confirmation**: the redirect test was the one
  exception — the assistant first checked this operator's own Claude memory
  directory, then ran `git log`/`find` to locate this very findings-log entry,
  recognized the documented scenario, and *then* chose the tool-catalog path,
  citing the doc as its reason. It landed on the right answer, but the underlying
  "go investigate the repo for context" reflex is not actually suppressed by the
  system overlay — it just happened to reinforce the correct behavior this time.
  In a different scenario the same reflex could as easily wander into something
  unhelpful, slower, or wrong. This is a distinct, still-open gap from the one
  fixed above (raised by the user, 2026-07-30) — the overlay reduces reliance on
  Bash for the *action itself*, but does not stop the model from using Bash as an
  *investigative* tool mid-task, including reading git history it has no
  particular reason to need for a live admin request.
- **A false lead worth recording**: the first fix attempt used a `@jini-ai/agent-runtime/dist/prompt-augmenter`
  deep-import workaround in both repos, based on a misdiagnosis that Tovu's
  classic `moduleResolution: "Node"` was systemically broken across hundreds of
  exports. An adversarial Opus review (explicitly instructed to try to refute the
  claim) found the real cause in ~7 minutes: a stale, hand-maintained ambient
  type shim (`src/assistant/jini-shims.d.ts`) declaring `CreateAgentExecutorOptions`
  with only 5 fields, shadowing the real (correct) interface. Fixed by updating the
  shim instead — no deep imports, no moduleResolution change. See
  `feedback_adversarial_verify_before_invasive_fix.md` in the auto-memory system.
- **Commits:** Jini `a2f923e33` (seam wiring); Tovu (this commit, jini-shims.d.ts fix + overlay content).
