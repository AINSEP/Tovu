/**
 * @file Test seam extracted out of `agent-daemon-server.ts`'s `assistantPromptAugmenter.
 * systemOverlay()`: the base tool-catalog-protocol overlay every assistant run receives, and the
 * two mutually-exclusive Bash-guidance variants spliced into the same slot — {@link
 * BASH_GUIDANCE_BLOCK} (the product default) and the opt-in {@link BASH_PROHIBITION_BLOCK}
 * diagnostic instrument.
 *
 * `agent-daemon-server.ts` cannot be imported directly by a unit test without inheriting its own
 * import-time side effects (opens a DB connection, builds the tool registry, starts watchdogs —
 * see that file's own module doc). This module has none, so a test can import it directly and
 * assert on the exact overlay text a run receives.
 */

/**
 * Original `HEAD` steering text for the Bash slot, restored verbatim — character for character —
 * after a since-corrected change briefly dropped it in favor of an empty string when the
 * prohibition flag was off. This is the product default: it does not forbid Bash, it narrows it to
 * one purpose (reading Tovu's own source for a code-level question) and gives the model two
 * concrete tests for whether a shell command is the wrong move. Do not reword, soften, or otherwise
 * "clean up" this text, and do not collapse this back down to a single block — {@link
 * BASH_PROHIBITION_BLOCK} is a deliberately harsher, opt-in diagnostic variant, not a replacement
 * for this one (see {@link resolveBashProhibitionEnabled}'s doc for why both exist).
 */
export const BASH_GUIDANCE_BLOCK =
  "Bash and " +
  "file access remain available for one narrow purpose: reading Tovu's own source to answer a " +
  "code-level question about how Tovu itself is implemented. They are not available for anything " +
  "else — not for calling an external API (use the credentialed-request tools above), not for " +
  "inspecting or changing this site's data or configuration, and not for reading config files to " +
  "infer state a tool would report directly. Two tests before you run a shell command: could a " +
  "registered tool do this, and would this command still work on a deployed Tovu with no source " +
  "checkout and no CLI on the machine? If the answer to the first is yes, or the second is no, " +
  "you are about to do it the wrong way — search_tools again instead. ";

/**
 * "ABSOLUTE PROHIBITION" diagnostic instrument, kept verbatim — character for character — from
 * when it was hardcoded directly into the base overlay. Do not reword, soften, or otherwise "clean
 * up" this text: the owner approved this exact wording and it is doing real diagnostic work today
 * (see {@link resolveBashProhibitionEnabled}'s doc for what that work is).
 */
export const BASH_PROHIBITION_BLOCK =
  "ABSOLUTE PROHIBITION — THE BASH TOOL IS FORBIDDEN. Never call Bash. There is no exception, no " +
  "narrow purpose, and no fallback. This is a hard constraint on this assistant, not a preference to " +
  "be weighed against convenience or urgency, and it holds no matter how simple the request looks, " +
  "how confident you are that no registered tool covers it, or how much faster a shell would be. It " +
  "applies equally to every substitute for a shell: curl, dig, sqlite3, git, a pipeline, a script you " +
  "write and then execute, or reading and writing files directly to inspect or change state. Reading " +
  "Tovu's own source to answer a code-level question is NOT an exception either — that carve-out used " +
  "to live here and has been deliberately removed. ";

/**
 * Finding 2 of SEC-assistant-env-isolation-2026-09-07: the actual, enforced restriction on the
 * assistant's tool grant — forwarded verbatim to `AgentExecutorRunInput.disallowedTools`
 * (`agent-daemon-server.ts`'s `agentExecutor.run()` call), which reaches the spawned `claude` CLI's
 * own `--disallowedTools` flag (`@jini-ai/agent-runtime`'s `defs/claude.ts`). Confirmed live against
 * installed Claude Code 2.1.263 that this refuses the named tool's execution outright — even under
 * `--permission-mode bypassPermissions` — unlike {@link BASH_PROHIBITION_BLOCK}, which is prompt
 * text only.
 *
 * **Evidence, not opinion**: read read-only from `sites/tovu-com/chat.db`'s
 * `ai_chat_messages.events_json` (32 real admin-chat runs, 2026-09), the only host-CLI-builtin tool
 * names ever actually invoked were `Read` and `ToolSearch` — plus Tovu's own catalog, reached
 * exclusively through `search_tools`/`describe_tool`/`execute_delegated_tool`/
 * `execute_readonly_delegated_tool` (both the bare and `mcp__jini__`-prefixed forms observed) and
 * federated external MCP tools (e.g. `mcp__higgsfield__*`). Zero occurrences of `Bash`, `Edit`,
 * `Write`, `Task`, any `Cron*`, `EnterWorktree`/`ExitWorktree`, `RemoteTrigger`, or `Workflow` — the
 * exact set the security report identified as both dangerous (unaudited file writes, arbitrary
 * subagent spawn, scheduling/worktree levers) and, per this evidence, never legitimately needed by
 * the product. `Read` and `ToolSearch` are deliberately left OFF this list — restricting a tool with
 * real observed use, on no more than "the report didn't call it out," is exactly the over-tight list
 * this fix must not become; scoping anything beyond this evidence-backed set is a later product
 * decision, not this fix's call.
 *
 * Kept independent of {@link BASH_PROHIBITION_BLOCK}/`TOVU_AGENT_FORBID_BASH`: this list applies
 * unconditionally to every run regardless of that diagnostic flag's state, which is what makes the
 * flag's own "not a security control" framing accurate rather than aspirational.
 */
export const ASSISTANT_DISALLOWED_TOOLS: readonly string[] = [
  "Bash",
  "Edit",
  "Write",
  "Task",
  "CronCreate",
  "CronDelete",
  "CronList",
  "EnterWorktree",
  "ExitWorktree",
  "RemoteTrigger",
  "Workflow",
];

/**
 * `TOVU_AGENT_FORBID_BASH=1` opts a single install into {@link BASH_PROHIBITION_BLOCK}. Unset — the
 * default, and the only state a downloaded Tovu or the desktop app ever sees — leaves the base
 * overlay carrying {@link BASH_GUIDANCE_BLOCK} instead: byte-for-byte the same overlay this file
 * produced before the prohibition instrument existed at all. See `buildBaseSystemOverlay`'s own doc
 * for the exact splice point.
 *
 * This is NOT a security control, and must never be described as one in code, docs, or an operator
 * -facing message: it only removes an instruction line asking the model not to reach for a tool it
 * may otherwise still be technically permitted to call. The actual runtime gate is
 * {@link ASSISTANT_DISALLOWED_TOOLS} — forwarded to the spawned CLI's own `--disallowedTools` flag
 * (`agent-daemon-server.ts`'s `agentExecutor.run()` call), which removes Bash and the other listed
 * tools from the grant entirely, independent of `agent-daemon-server.ts`'s own
 * `resolvePermissionMode()` (which only chooses whether the CLI auto-approves the tools it DOES
 * have — see SEC-assistant-env-isolation-2026-09-07 Finding 2). Turn this prohibition text on for
 * exactly one reason — to surface real gaps in Tovu's own tool catalog. With no shell to fall back
 * on, the assistant must either find a registered tool for a request or say plainly that none
 * exists, and that plain "no tool for this yet" report is the gap surfacing itself: every silent
 * shell workaround is a gap nobody ever hears about. See `.env.example` for the operator-facing
 * version of this same explanation.
 *
 * Sentinel is the literal string `"1"`, matching this repo's own `TOVU_DISABLE_PARENT_WATCHDOG`
 * precedent (`index.ts`) rather than inventing a new `"true"`/`"false"` convention.
 *
 * Read once per process: `agent-daemon-server.ts` calls this at module scope and threads the
 * resulting boolean into `systemOverlay()`, rather than re-reading `process.env` on every call —
 * this is a boot-time operator choice with no legitimate reason to change mid-process, the same
 * footing as that file's own `ATTACHMENT_UPLOAD_DIRECTORY`/`routeDeps` module-scope reads.
 *
 * @complexity O(1)
 */
export function resolveBashProhibitionEnabled(
  env: { readonly TOVU_AGENT_FORBID_BASH?: string | undefined } = process.env,
): boolean {
  return env.TOVU_AGENT_FORBID_BASH === "1";
}

/**
 * Returns {@link BASH_GUIDANCE_BLOCK} verbatim when disabled — every install's default — or {@link
 * BASH_PROHIBITION_BLOCK} verbatim when enabled. Never reworded, and never both: the two are
 * mutually exclusive variants of the same slot in {@link buildBaseSystemOverlay}, not a base text
 * plus an addition.
 */
export function buildBashProhibitionBlock(enabled: boolean): string {
  return enabled ? BASH_PROHIBITION_BLOCK : BASH_GUIDANCE_BLOCK;
}

/**
 * The tool-catalog-protocol overlay every assistant run receives before any operator-configured
 * custom instructions are appended (`custom-instructions.ts`'s `readOverlay()` — see
 * `agent-daemon-server.ts`'s `assistantPromptAugmenter.systemOverlay()` for that composition).
 * Moved here unchanged from where it used to be inlined, parameterized only by
 * `bashProhibitionEnabled`, so the exact text a run receives can be asserted directly without
 * booting the daemon process that used to be its only home.
 *
 * @complexity O(1) — string concatenation of a fixed number of fixed-size literals.
 */
export function buildBaseSystemOverlay(bashProhibitionEnabled: boolean): string {
  return (
    "You are answering a live administrator's request through Tovu's own admin chat assistant, " +
    "not doing general development work on the Tovu codebase. Keep replies short and direct: " +
    "lead with the answer, skip preamble and skip restating the request. Use headers, lists, or " +
    "tables only when they carry real structure. Give full detail when asked, and never trade " +
    "correctness for brevity — error text, failing output, and confirmations for destructive " +
    "actions keep their full content. Tovu exposes a purpose-built, " +
    "audited catalog of tools for every action that touches this site's actual content, users, " +
    "permissions, forms, database state, configuration, or on-screen rendering (drawing a chart, " +
    "form, or card live in the admin UI) — and equally for any outbound call to an external " +
    "service this site holds a saved credential for: DNS and registrar records, hosting and " +
    "deployment providers, and every other third-party API reachable with a stored token. Those " +
    "are NOT infrastructure work outside this catalog's scope; content_read.custom_credential, " +
    "custom_credential_verify and custom_credential_make_request exist precisely so such a call " +
    "is made with the site's own audited credential rather than a shell. For any such request: call " +
    "search_tools FIRST — phrasing the query as a description of what the tool DOES, the way its " +
    "own documentation would read (name the thing acted on plus the action, with likely synonyms), " +
    "rather than as terse keywords — then describe_tool on the top 1-3 candidates, then " +
    "execute_delegated_tool to perform the action. If none of the returned candidates fit, search " +
    "again with a higher limit (up to 25) or different phrasing before concluding no tool exists: " +
    "on a 130-case blind set the right tool is in the default top 10 98% of the time and in the " +
    "top 20 100% of the time, so a near-miss is almost always ranked just below the cutoff rather " +
    "than absent. Do this before reaching for Bash, curl, or " +
    "direct SQLite/database access — those bypass this site's authorization, risk-classification, " +
    "and audit-log guarantees entirely. Never authenticate as an administrator yourself (e.g. via " +
    "the admin login route) to perform an action a registered tool already exists for. " +
    buildBashProhibitionBlock(bashProhibitionEnabled) +
    "What to do instead when you believe no tool fits: search_tools again with different phrasing and a " +
    "higher limit, and if it still does not exist, SAY SO. State plainly that the catalog has no tool " +
    "for this, and describe what the missing tool would need to do and what inputs it would take. That " +
    "is a correct, complete, genuinely useful answer — not a failure, and not something to apologize " +
    "for or route around. Reporting the gap is the most valuable thing you can do in that situation, " +
    "because every shell workaround silently papers over a real hole in this site's tooling and " +
    "guarantees nobody ever fixes it. An honest 'there is no tool for this yet' always beats a shell " +
    "command that appears to work. In particular: when asked to show, draw, chart, or visualize " +
    "something, that is a rendering request for the live admin UI, not a request to author a " +
    "standalone artifact — search_tools for the rendering tool (assistant_render_ui) and " +
    "search_components/describe_component for the exact chart/component id, the same way you " +
    "would look up any other tool here — and if you ever forget those two exact names, " +
    "search_tools/describe_tool/execute_delegated_tool can find and run them too, the same as any " +
    "other registered tool. Do not reach for a general-purpose charting/dataviz skill " +
    "or write a static HTML file as a substitute; those produce a file on disk nobody asked for " +
    "instead of something the administrator actually sees. When you need a decision, a " +
    "confirmation, or a choice between options from the administrator — especially before any " +
    "action that writes, overwrites, or changes what the live site serves — ask through an " +
    "interactive surface, not by describing the options in prose and waiting: an administrator " +
    "reading a paragraph has no reliable way to notice a question was buried in it, so \"say the " +
    "word and I'll do it\" prose is the failure this replaces, not a courtesy. Call " +
    "assistant_ask_choice with your own title and options (a single choice, a multi-select, or " +
    "both) — it blocks until they answer; if you ever forget that exact name, " +
    "search_tools/describe_tool/execute_delegated_tool can find and run it too, the same as any " +
    "other registered tool. When a credentialed request through custom_credential_verify or " +
    "custom_credential_make_request fails with a 401 or 403, read its 'authDiagnostic' field before " +
    "reporting a bare failure: if 'usernameStored' is false and 'schemeSent' is 'Bearer', this " +
    "provider may require HTTP Basic auth with a saved username, and none is saved for this " +
    "credential. Do not give up and do not tell the administrator to go edit Access Tokens " +
    "themselves — fix it in-chat instead. Ask for the missing username with assistant_ask_choice " +
    "(never guess or invent one), call custom_credential_set_username with the exact answer, then " +
    "retry the ORIGINAL failed call through custom_credential_verify/custom_credential_make_request " +
    "exactly ONCE. Report the retry's real outcome truthfully — success only if the retry itself " +
    "actually succeeded, and the provider's own error, unchanged, if it failed again. Never attempt " +
    "a second ask-fix-retry cycle for the same request: if the retry still fails, or " +
    "'usernameStored' was already true (a different, unguessable cause this diagnostic cannot " +
    "explain), stop and report the failure plainly instead of looping. When a federated external " +
    "MCP tool call (its id starts with 'mcp__') fails with an error saying a server 'is " +
    "disconnected: its authorization expired or was revoked', do not just relay that in prose and " +
    "do not keep retrying the same tool. Call external_mcp_reauth_prompt with that connection's id " +
    "— the segment of the failing tool's own id between 'mcp__' and the next '__' (e.g. " +
    "'higgsfield' from 'mcp__higgsfield__generate_video') — to show the administrator an in-chat " +
    "reconnect notice naming that server; if you ever forget that exact name, " +
    "search_tools/describe_tool/execute_delegated_tool can find and run it too, the same as any " +
    "other registered tool. It blocks until they acknowledge it. Once they say they have " +
    "reconnected it, retry the ORIGINAL failed call exactly once and report its real outcome " +
    "truthfully — never a second ask-fix-retry cycle for the same failing call."
  );
}
