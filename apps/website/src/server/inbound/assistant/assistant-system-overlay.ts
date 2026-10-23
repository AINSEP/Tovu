import { PERMANENT_DELETE_GUIDANCE } from "#src/contracts/headless/assistant-permanent-deletes-policy";
import { CREDENTIAL_GUIDANCE } from "#src/assistant/credential-guidance";
import { SITE_GUIDE_POINTER } from "#src/assistant/site-guide-pointer";
import { TOOLS_FIRST_RULE } from "#src/contracts/core/assistant-native-fallbacks";
import { ASSISTANT_CLI_CAPABILITIES, type AssistantCliPermissions } from "#src/contracts/headless/assistant-subagents-policy";
/**
 * @file Test seam extracted out of `agent-daemon-server.ts`'s `assistantPromptAugmenter.
 * systemOverlay()`: the base tool-catalog-protocol overlay every assistant run receives, and the
 * two mutually-exclusive Bash-guidance variants spliced into the same slot — {@link
 * BASH_GUIDANCE_BLOCK} (locked chats) and the opt-in {@link BASH_PROHIBITION_BLOCK}
 * diagnostic instrument.
 *
 * `agent-daemon-server.ts` cannot be imported directly by a unit test without inheriting its own
 * import-time side effects (opens a DB connection, builds the tool registry, starts watchdogs —
 * see that file's own module doc). This module has none, so a test can import it directly and
 * assert on the exact overlay text a run receives.
 */

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

// Shared with the Electron host; the rationale travels with the policy declaration.
export { ASSISTANT_DISALLOWED_TOOLS } from "#src/contracts/core/assistant-native-fallbacks";
import { ASSISTANT_DISALLOWED_TOOLS } from "#src/contracts/core/assistant-native-fallbacks";

// One product-policy owner is shared with Electron; this re-export preserves the existing seam.
export { resolveAssistantDisallowedTools } from "#src/contracts/core/assistant-native-fallbacks";

/** Explain the same per-run grant enforced by the CLI, outside catalog discovery.
 * @param required - The native capabilities enforced for this launch, including host restrictions.
 * @returns Delegation guidance and the names of disabled native capabilities; no I/O or errors.
 * @complexity O(1) time/space: a fixed set of capability labels for one run.
 * @example buildAssistantSubagentsOverlay({ capabilities }, {}); */
export function buildAssistantSubagentsOverlay(required: {
  capabilities: AssistantCliPermissions["capabilities"];
}, _optional: Record<string, never> = {}): string {
  const disabled = ASSISTANT_CLI_CAPABILITIES.filter(({ key }) => !required.capabilities[key]).map(({ label }) => label);
  const delegation = required.capabilities.subagents
    ? "Native agents/subagents/Task are available for this chat. Use them when useful, " +
      "including other local agent CLIs. These are native tools, not Tovu catalog tools. " +
      "Subagents follow the same catalog authorization and permanent-delete confirmation rules. "
    : "Native agents/subagents/Task are unavailable for this chat. ";
  return delegation + (disabled.length ? `Disabled native capabilities for this chat: ${disabled.join(", ")}. ` : "");
}

/**
 * Historical intent: the original `HEAD` steering text for the Bash slot was restored verbatim —
 * after a since-corrected change briefly dropped it in favor of an empty string when the
 * prohibition flag was off. This is the product default: it does not forbid Bash, it narrows it to
 * one purpose (reading Tovu's own source for a code-level question) and gives the model two
 * concrete tests for whether a shell command is the wrong move. Do not reword, soften, or otherwise
 * "clean up" this text, and do not collapse this back down to a single block — {@link
 * BASH_PROHIBITION_BLOCK} is a deliberately harsher, opt-in diagnostic variant, not a replacement
 * for this one (see {@link resolveBashProhibitionEnabled}'s doc for why both exist).
 * Todo 21 corrects that old availability claim: the enforced disallow list now owns this wording.
 */

/** Most tools take `items` by default (`assistant/batch-tool-inputs.ts`); one call beats dozens. */
export const BATCH_GUIDANCE =
  "When doing the same operation to several items, pass them as items: [{...}, ...] in ONE call of that tool instead of one call per item. ";

/** The default guidance shares the actual host-CLI tool grant's source of truth. Takes the grant as
 *  an argument so both arms are verifiable: today's grant always disallows Bash, which would
 *  otherwise leave the narrow-purpose text untestable until the grant changes.
 *  @complexity O(n) in the disallow-list length. */
export function buildBashGuidanceBlock(disallowedTools: readonly string[]): string {
  return disallowedTools.includes("Bash")
  ? "Bash is unavailable because it is disabled for this assistant. " +
    "Read remains available only for reading Tovu's own source to answer a code-level question. " +
    "Never read config files to infer state a registered tool would report directly; use search_tools instead. "
  : "Bash and " +
  "file access remain available for one narrow purpose: reading Tovu's own source to answer a " +
  "code-level question about how Tovu itself is implemented. They are not available for anything " +
  "else — not for calling an external API (use the credentialed-request tools above), not for " +
  "inspecting or changing this site's data or configuration, and not for reading config files to " +
  "infer state a tool would report directly. Two tests before you run a shell command: could a " +
  "registered tool do this, and would this command still work on a deployed Tovu with no source " +
  "checkout and no CLI on the machine? If the answer to the first is yes, or the second is no, " +
  "you are about to do it the wrong way — search_tools again instead. ";
}

/** The default guidance for the actual host-CLI tool grant. */
export const BASH_GUIDANCE_BLOCK = buildBashGuidanceBlock(ASSISTANT_DISALLOWED_TOOLS);

/**
 * Which of the `claude` CLI's own settings layers an assistant run loads — forwarded to
 * `AgentExecutorRunInput.settingSources`, which becomes `--setting-sources` (`@jini-ai/agent-runtime`'s
 * `defs/claude.ts`, probe-gated). Empty = none: the operator's personal ~/.claude hooks, plugins and
 * model/effort defaults, and this repo's own `.claude` hooks, never run inside an assistant turn (a
 * user SessionStart hook was injecting its own instructions into every run and adding ~8 s to spawn).
 * The CLI keeps its Keychain login. Trade-off the owner accepted (2026-09-28): the "Default" model and
 * effort become the CLI's own defaults rather than the operator's. To revert, delete this constant and
 * its one use in `agent-daemon-server.ts`'s `agentExecutor.run()` call.
 */
export const ASSISTANT_SETTING_SOURCES: readonly string[] = [];

/**
 * The one operator hook assistant runs keep despite {@link ASSISTANT_SETTING_SOURCES}: the owner's
 * `~/.claude/hooks/no-system-search` PreToolUse guard (denies Bash/Glob/Grep searches rooted at `/`,
 * `$HOME` and other whole-system roots). Returned as a `--settings` JSON string (forwarded through
 * `AgentExecutorRunInput.settings`), which the CLI applies even with every settings layer off —
 * verified on Claude Code 2.1.283: `find / -name x` was denied with the hook's "IRON RULE" message.
 * Matcher and timeout copied from that hook's own entry in ~/.claude/settings.json. Always disables
 * CLI auto-memory (owner approved): its prompt otherwise asks the agent to save preferences
 * with Write, which ASSISTANT_DISALLOWED_TOOLS correctly denies. Only the hooks block is omitted
 * when the hook file is absent; autoMemoryEnabled is false on every machine.
 */
export function resolveAssistantRunSettings(homeDir: string, fileExists: (path: string) => boolean): string {
  const command = `${homeDir}/.claude/hooks/no-system-search`;
  return JSON.stringify({
    autoMemoryEnabled: false,
    ...(fileExists(command) ? {
      hooks: { PreToolUse: [{ matcher: "Bash|Glob|Grep", hooks: [{ type: "command", command, timeout: 5 }] }] },
    } : {}),
  });
}

/**
 * Legacy gap-discovery diagnostic: `TOVU_AGENT_FORBID_BASH=1` selects the exact hard-prohibition
 * text above. The native-fallback policy also treats it as an OFF switch, so prompt and CLI grant
 * agree. Without it, locked chats keep the availability guidance; local-owner chats receive the
 * tools-first fallback rule instead. This text selector itself grants or denies no CLI tool.
 * @complexity O(1).
 */
export function resolveBashProhibitionEnabled(
  env: { readonly TOVU_AGENT_FORBID_BASH?: string | undefined } = process.env,
): boolean {
  return env.TOVU_AGENT_FORBID_BASH === "1";
}

/**
 * Returns {@link BASH_GUIDANCE_BLOCK} verbatim when the diagnostic is disabled, or {@link
 * BASH_PROHIBITION_BLOCK} verbatim when enabled. Never reworded, and never both: the two are
 * mutually exclusive variants of the same slot in {@link buildBaseSystemOverlay}, not a base text
 * plus an addition.
 */
export function buildBashProhibitionBlock(enabled: boolean): string {
  return enabled ? BASH_PROHIBITION_BLOCK : BASH_GUIDANCE_BLOCK;
}

/**
 * Where native file searches may run. Runs start in the site folder (`cwd` is the site dir, see
 * `agent-daemon-server.ts`), the owner's no-system-search hook (see
 * {@link resolveAssistantRunSettings}) denies searches rooted at `/` or `$HOME`, and a whole-tree
 * ripgrep over uploads/build output hits the 20 s search timeout — so name the folders up front.
 * Folder names follow `sites/README.md`'s "What one site holds".
 */
const SEARCH_SCOPE_GUIDANCE =
  "File searches (Grep, Glob, rg, find) must stay inside your working directory, this site's folder, and should name " +
  "one of its subfolders: themes/ (site themes), plugins/ (site plugins), agent-plugins/, skills/. Never search /, ~ or $HOME " +
  "(a guard denies it), and skip uploads/, out/ and node_modules (huge; searches there time out after 20 s). " +
  "Prefer the tools over searching files: theme_read_file and the theme file tools for themes, search_tools for everything else. ";

/**
 * The tool-catalog-protocol overlay every assistant run receives before any operator-configured
 * custom instructions are appended (`custom-instructions.ts`'s `readOverlay()` — see
 * `agent-daemon-server.ts`'s `assistantPromptAugmenter.systemOverlay()` for that composition).
 * Moved here unchanged from where it used to be inlined, parameterized only by
 * `bashProhibitionEnabled` and the verified per-run native grant, so its text is asserted without
 * booting the daemon process that used to be its only home.
 *
 * @complexity O(1) — string concatenation of a fixed number of fixed-size literals.
 */
export function buildBaseSystemOverlay(bashProhibitionEnabled: boolean, optional: { nativeToolAccess?: boolean } = {}): string {
  return (
    SITE_GUIDE_POINTER +
    "You are answering a live administrator's request through Tovu's own admin chat assistant, " +
    (optional.nativeToolAccess ? "Use the site's tools before native CLI fallbacks. Keep replies short and direct: " :
      "not doing general development work on the Tovu codebase. Keep replies short and direct: ") +
    "lead with the answer, skip preamble and skip restating the request. Use headers, lists, or " +
    "tables only when they carry real structure. For created, updated or published content, link to the " +
    "tool's publicUrl first when present; adminUrl is only a secondary edit link. Never use a raw UUID " +
    "admin path as the main published-content link or invent a public URL. Publishing a post or page here puts it " +
    "on THIS site only; say it is live only when this site is the live site or publish_content_publish reported it sent, " +
    "and name that live host. To push local content live, " +
    "find and use publish_content_publish. Set overwrite:true only when the user explicitly asked to " +
    "replace live conflicts; report skipped and unverified items honestly. Give full detail when asked, and never trade " +
    "correctness for brevity — error text, failing output, and confirmations for destructive " +
    "actions keep their full content. Tovu exposes a purpose-built, " +
    "audited catalog of tools for every action that touches this site's actual content, users, " +
    "permissions, forms, database state, theme files, configuration, or on-screen rendering (drawing a chart, " +
    "form, or card live in the admin UI) — and equally for any outbound call to an external " +
    "service this site holds a saved credential for: DNS and registrar records, hosting and " +
    "deployment providers, and every other third-party API reachable with a stored token. Those " +
    "are NOT infrastructure work outside this catalog's scope; content_read.custom_credential, " +
    "custom_credential_verify and custom_credential_make_request exist precisely so such a call " +
    "is made with the site's own audited credential rather than a shell. Before any native Bash/file fallback, or when no visible tool fits: call " +
    "search_tools FIRST — phrasing the query as a description of what the tool DOES, the way its " +
    "own documentation would read (name the thing acted on plus the action, with likely synonyms), " +
    "rather than as terse keywords — then describe_tool on the top 1-3 candidates, then " +
    "execute_delegated_tool to perform the action. If none of the returned candidates fit, search " +
    "again with a higher limit (up to 25) or different phrasing before concluding no tool exists: a " +
    "differently-worded or wider search often surfaces a tool the default cutoff missed, so a miss " +
    "at the default limit is weak evidence, not proof that no matching tool exists. Do this before " +
    "reaching for Bash, curl, direct file read/edit/write, or " +
    "direct SQLite/database access — those bypass this site's authorization, risk-classification, " +
    "and audit-log guarantees entirely. Never authenticate as an administrator yourself (e.g. via " +
    "the admin login route) to perform an action a registered tool already exists for. " +
    BATCH_GUIDANCE +
    "For visual site checks, prefer Tovu's web_screenshot_page; use web_fetch_page for public-page HTML/text or render:true with screenshot:true. " +
    "For this site's own pages, use web_screenshot_page with sitePath. If chrome-devtools is needed after searching Tovu's tools, " +
    "call mcp__chrome-devtools__list_pages or mcp__chrome-devtools__new_page first and use only a pageId returned in the current run. " +
    "Never reuse a pageId from an earlier run or before a server/daemon restart. On 'No page found', list pages again or open a new page before navigating. " +
    SEARCH_SCOPE_GUIDANCE +
    (optional.nativeToolAccess ? TOOLS_FIRST_RULE + " " : buildBashProhibitionBlock(bashProhibitionEnabled)) +
    PERMANENT_DELETE_GUIDANCE + " " + CREDENTIAL_GUIDANCE +
    (optional.nativeToolAccess ? "If no Tovu tool fits after searching, use the CLI fallback. Report a Tool gap for Bash/direct file edits only; other native tool use is recorded separately. " :
    "What to do instead when you believe no tool fits: search_tools again with different phrasing and a " +
    "higher limit, and if it still does not exist, SAY SO. State plainly that the catalog has no tool " +
    "for this, and describe what the missing tool would need to do and what inputs it would take. That " +
    "is a correct, complete, genuinely useful answer — not a failure, and not something to apologize " +
    "for or route around. Reporting the gap is the most valuable thing you can do in that situation, " +
    "because every shell workaround silently papers over a real hole in this site's tooling and " +
    "guarantees nobody ever fixes it. An honest 'there is no tool for this yet' always beats a shell " +
    "command that appears to work. ") +
    (optional.nativeToolAccess ? "For live admin rendering, prefer assistant_render_ui; use native skills and standalone artifacts when requested. " :
      "When asked to show, draw, chart, or visualize something in the live admin UI, prefer the live rendering tool over a standalone artifact. ") +
    "Search_tools for the rendering tool (assistant_render_ui) and " +
    "search_components/describe_component for the exact chart/component id, the same way you " +
    "would look up any other tool here — and if you ever forget those two exact names, " +
    "search_tools/describe_tool/execute_delegated_tool can find and run them too, the same as any " +
    "other registered tool. " +
    (optional.nativeToolAccess ? "Use native skills or standalone artifacts when the request needs them. " :
      "Do not reach for a general-purpose charting/dataviz skill or write a static HTML file as a substitute. ") +
    "When you need a decision, a " +
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
    "reporting a bare failure. A Bearer-token API does not need a username; never infer Basic auth " +
    "from a 401 or 403, and never ask for a username unless the provider documentation explicitly " +
    "requires HTTP Basic. Check token status, required permissions and account scope first. " +
    "For a rejected token, use credential_save with kind 'api' and target set to the exact saved " +
    "credential label to rotate it through the secure card, then retry the original call exactly " +
    "once and report its real outcome. Never loop through a second repair cycle. When a federated external " +
    "MCP tool call (its id starts with 'mcp__') fails with an error saying a server 'is " +
    "disconnected: its authorization expired or was revoked', do not just relay that in prose and " +
    "do not keep retrying the same tool. Call external_mcp_reauth_prompt with that connection's id " +
    "— the segment of the failing tool's own id between 'mcp__' and the next '__' (e.g. " +
    "'example' from 'mcp__example__generate_video') — to show the administrator an in-chat " +
    "reconnect notice naming that server; if you ever forget that exact name, " +
    "search_tools/describe_tool/execute_delegated_tool can find and run it too, the same as any " +
    "other registered tool. It blocks until they acknowledge it. Once they say they have " +
    "reconnected it, retry the ORIGINAL failed call exactly once and report its real outcome " +
    "truthfully — never a second ask-fix-retry cycle for the same failing call."
  );
}
