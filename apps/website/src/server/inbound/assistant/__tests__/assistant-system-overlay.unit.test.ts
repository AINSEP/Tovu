import assert from "node:assert/strict";
import test from "node:test";
import { assistantCliPermissions } from "#src/contracts/headless/assistant-subagents-policy";
import { TOOLS_FIRST_RULE } from "#src/contracts/core/assistant-native-fallbacks";

import {
  ASSISTANT_DISALLOWED_TOOLS,
  ASSISTANT_SETTING_SOURCES,
  BASH_GUIDANCE_BLOCK,
  BATCH_GUIDANCE,
  BASH_PROHIBITION_BLOCK,
  buildBaseSystemOverlay,
  buildBashGuidanceBlock,
  buildBashProhibitionBlock,
  resolveAssistantRunSettings,
  resolveBashProhibitionEnabled,
  buildAssistantSubagentsOverlay,
  resolveAssistantDisallowedTools,
} from "../assistant-system-overlay.js";

test("resolveBashProhibitionEnabled defaults to false with no env var set", () => {
  assert.equal(resolveBashProhibitionEnabled({}), false);
});

test("resolveBashProhibitionEnabled is false for anything other than the exact sentinel '1'", () => {
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "true" }), false);
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "0" }), false);
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "" }), false);
});

test("resolveBashProhibitionEnabled reads the '1' sentinel exactly", () => {
  assert.equal(resolveBashProhibitionEnabled({ TOVU_AGENT_FORBID_BASH: "1" }), true);
});

test("buildBashProhibitionBlock(false) is BASH_GUIDANCE_BLOCK verbatim, unmodified", () => {
  assert.equal(buildBashProhibitionBlock(false), BASH_GUIDANCE_BLOCK);
});

test("buildBashProhibitionBlock(true) is BASH_PROHIBITION_BLOCK verbatim, unmodified", () => {
  assert.equal(buildBashProhibitionBlock(true), BASH_PROHIBITION_BLOCK);
});

// Regression: a same-day change dropped the original HEAD steering text entirely when the
// prohibition flag was off, leaving a downloaded Tovu with LESS Bash guidance than it had
// yesterday. The owner approved restoring it verbatim as the flag-off default — this is the core
// defect this file exists to fix.
test("default (flag off): the base overlay carries the original steering text, not the prohibition", () => {
  const overlay = buildBaseSystemOverlay(false);
  assert.equal(overlay.includes(BASH_GUIDANCE_BLOCK), true);
  assert.equal(overlay.includes("ABSOLUTE PROHIBITION"), false);
  assert.equal(overlay.includes("THE BASH TOOL IS FORBIDDEN"), false);
});

test("flag on: the base overlay contains the prohibition block verbatim, not the steering text", () => {
  const overlay = buildBaseSystemOverlay(true);
  assert.equal(overlay.includes("ABSOLUTE PROHIBITION"), true);
  assert.equal(overlay.includes(BASH_PROHIBITION_BLOCK), true);
  assert.equal(overlay.includes(BASH_GUIDANCE_BLOCK), false);
});

test("the rest of the base overlay is identical whether the flag is on or off", () => {
  // Splitting each overlay on its own variant of the Bash slot isolates exactly the one piece
  // allowed to differ; every other character — tool-catalog protocol, ask-choice guidance,
  // credential-auth-diagnostic instructions, etc — must be byte-for-byte the same either way.
  const overlayOff = buildBaseSystemOverlay(false);
  const overlayOn = buildBaseSystemOverlay(true);
  assert.equal(
    overlayOn.replace(BASH_PROHIBITION_BLOCK, ""),
    overlayOff.replace(BASH_GUIDANCE_BLOCK, ""),
  );
});

test("search-first applies when no visible tool fits or before a native fallback", () => {
  for (const prohibited of [false, true]) for (const nativeToolAccess of [false, true]) {
    const overlay = buildBaseSystemOverlay(prohibited, { nativeToolAccess });
    assert.match(overlay, /Before any native Bash\/file fallback, or when no visible tool fits: call search_tools FIRST/);
    assert.equal(overlay.match(/phrasing the query as a description of what the tool DOES/g)?.length, 1);
    assert.equal(overlay.includes("What to do instead when you believe no tool fits"), !nativeToolAccess);
    assert.equal(overlay.includes("assistant_ask_choice"), true);
  }
});

test("native file fallbacks and Tool gap reports require a search and retry with named queries", () => {
  assert.match(TOOLS_FIRST_RULE, /Before any Bash or direct file read\/edit\/write of site files \(themes, content, config\), call search_tools describing the job/);
  assert.match(TOOLS_FIRST_RULE, /retry with different phrasing or a higher limit/);
  assert.match(TOOLS_FIRST_RULE, /Only if those searches find no suitable Tovu tool may you use native fallbacks/);
  assert.match(TOOLS_FIRST_RULE, /Only after those searches, report the fallback/);
  assert.ok(TOOLS_FIRST_RULE.includes("`Tool gap: <what you needed> — no Tovu tool for it.`"));
  assert.match(TOOLS_FIRST_RULE, /Include the queries you searched in <what you needed>/);
  assert.ok(buildBaseSystemOverlay(false, { nativeToolAccess: true }).includes(TOOLS_FIRST_RULE));
});

test("every overlay prefers Tovu visual tools and requires fresh Chrome DevTools page ids", () => {
  for (const prohibited of [false, true]) for (const nativeToolAccess of [false, true]) {
    const overlay = buildBaseSystemOverlay(prohibited, { nativeToolAccess });
    assert.match(overlay, /For visual site checks, prefer Tovu's web_screenshot_page; use web_fetch_page/);
    assert.match(overlay, /this site's own pages, use web_screenshot_page with sitePath/);
    assert.match(overlay, /mcp__chrome-devtools__list_pages or mcp__chrome-devtools__new_page first/);
    assert.match(overlay, /only a pageId returned in the current run/);
    assert.match(overlay, /Never reuse a pageId from an earlier run or before a server\/daemon restart/);
    assert.match(overlay, /On 'No page found', list pages again or open a new page before navigating/);
  }
});

test("every overlay names where file searches may run, so the no-system-search hook and 20 s search timeouts are avoided", () => {
  for (const prohibited of [false, true]) for (const nativeToolAccess of [false, true]) {
    const overlay = buildBaseSystemOverlay(prohibited, { nativeToolAccess });
    assert.match(overlay, /File searches \(Grep, Glob, rg, find\) must stay inside your working directory/);
    for (const folder of ["themes/", "plugins/", "agent-plugins/", "skills/"]) assert.ok(overlay.includes(folder), `names ${folder}`);
    assert.match(overlay, /Never search \/, ~ or \$HOME/);
    assert.match(overlay, /uploads\/, out\/ and node_modules/);
    assert.match(overlay, /theme_read_file/);
  }
});

// FABRICATED-STAT FIX (2026-09-08): the overlay used to assert "the right tool is in the default
// top 10 98% of the time and in the top 20 100% of the time". Verified fabricated: the eval it
// claimed as its source (`tool-search-heldout-v2.eval.ts`) declares `CUTOFFS = [1, 3, 5, 10] as
// const` — no top-20 cutoff exists in that file. `git log -S` on the exact phrase traces it to
// `d6ac6975` (2026-08-08), which added it as brand-new text (to this file's pre-extraction home,
// `agent-daemon-server.ts`) with no cited measurement — not carried through from a real eval run.
// Full trail: `ADS-memory/reports/2026-09-08-byok-fabricated-stat.md`.
//
// The fix does NOT replace the false number with a true-today one — see that report for why: a
// retrieval percentage is a property of the current catalog, the catalog is actively changing in
// this same repo, and nothing in this file re-measures the number it would assert. The second
// assertion below guards that reasoning directly, failing the moment anyone adds ANY percentage
// back to this text, not just the specific old one. It also removes a standing internal
// contradiction: a "100% of the time" guarantee sat a few sentences before this same overlay's own
// "if it still does not exist, SAY SO" guidance — both cannot be true at once.
// Deliberately NOT a full-string pin (superseded an earlier version of this test that was one):
// pinning the entire sentence recreates the same trap in the test layer that this fix removes
// from the prompt text — a maintainer reworking the retry guidance would have to fight a
// brittle test unrelated to the property that actually matters. These assert the specific,
// load-bearing phrases the behavior depends on instead.
test("every overlay tells the model a miss at the default cutoff is weak evidence, not proof no tool exists, and to retry before giving up", () => {
  for (const prohibited of [false, true]) for (const nativeToolAccess of [false, true]) {
    const overlay = buildBaseSystemOverlay(prohibited, { nativeToolAccess });
    assert.match(overlay, /search again with a higher limit \(up to 25\) or different phrasing/);
    assert.match(overlay, /weak evidence, not proof that no matching tool exists/);
  }
});

test("neither overlay names a coverage percentage — a hardcoded retrieval number here is the exact shape of the defect this fixes, regardless of whether the number happens to be true today", () => {
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true)]) {
    assert.doesNotMatch(overlay, /\d+%/);
  }
});

// Finding 2 (SEC-assistant-env-isolation-2026-09-07): ASSISTANT_DISALLOWED_TOOLS is the actual,
// enforced gate (agent-daemon-server.ts forwards it to AgentExecutorRunInput.disallowedTools) —
// these pin its exact contents against silent drift, since a caller reads this array by reference.
test("ASSISTANT_DISALLOWED_TOOLS names exactly the host-CLI-builtin tools the security report flagged as dangerous and unused", () => {
  assert.deepEqual(
    ASSISTANT_DISALLOWED_TOOLS.filter((rule) => !rule.includes("(")).sort(),
    [
      "Agent",
      "Bash",
      "BashOutput",
      "CronCreate",
      "CronDelete",
      "CronList",
      "Edit",
      "EnterWorktree",
      "ExitWorktree",
      "KillShell",
      "MultiEdit",
      "NotebookEdit",
      "RemoteTrigger",
      "Task",
      "Workflow",
      "Write",
    ].sort(),
  );
});

test("one full-access grant controls native tools on every CLI while preserving Read path denies", () => {
  for (const agentId of ["claude", "codex"]) for (const nativeToolAccess of [false, true]) {
    const tools = resolveAssistantDisallowedTools({ agentId, subagentsEnabled: nativeToolAccess, nativeToolAccess });
    for (const tool of ["Bash", "Edit", "Write", "Agent", "Task", "Workflow"]) assert.equal(tools.includes(tool), !nativeToolAccess);
    for (const tool of ASSISTANT_DISALLOWED_TOOLS.filter(tool => tool.startsWith("Read("))) assert.ok(tools.includes(tool));
  }
});

test("delegation guidance follows the subagent capability without claiming full CLI access", () => {
  const overlay = buildAssistantSubagentsOverlay({ capabilities: assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }).capabilities });
  for (const phrase of ["Native agents/subagents/Task are available", "not Tovu catalog tools"]) assert.ok(overlay.includes(phrase), phrase);
  assert.doesNotMatch(overlay, /Full CLI access is ON|haiku|sonnet|Avoid fork|Disabled native capabilities/);
});

test("shell OFF with subagents ON names the disabled capabilities without denying delegation", () => {
  const capabilities = assistantCliPermissions({ enabled: true, capabilities: { shell: false, userMcp: false, workflows: false } }).capabilities;
  const overlay = buildAssistantSubagentsOverlay({ capabilities });
  assert.match(overlay, /Native agents\/subagents\/Task are available/);
  assert.match(overlay, /Disabled native capabilities for this chat: Bash\/shell, Your MCP servers, Workflows\./);
  assert.doesNotMatch(overlay, /Full CLI access is ON/);
});

test("disabled subagents do not claim independently enabled workflows are unavailable", () => {
  const capabilities = assistantCliPermissions({ enabled: true, capabilities: { subagents: false, userMcp: true } }).capabilities;
  const overlay = buildAssistantSubagentsOverlay({ capabilities });
  assert.match(overlay, /Native agents\/subagents\/Task are unavailable/);
  assert.match(overlay, /Disabled native capabilities for this chat: Subagents\/Task\./);
  assert.doesNotMatch(overlay, /workflows are unavailable/i);
});

// FAQ claim (public docs): "In Local CLI mode, Claude Code can read files and search the web, but
// can't run commands or edit files." MultiEdit and NotebookEdit both write files to disk exactly
// like Edit/Write (NotebookEdit edits .ipynb cell contents in place); BashOutput and KillShell are
// the read/kill halves of a Bash-started background process and belong in the same
// shell/background-process category this list already partly covers via Cron*/EnterWorktree/
// ExitWorktree/RemoteTrigger/Workflow. None of the four were on the list, so the FAQ's "can't edit
// files" claim was false for any Claude Code build that ships them as host-CLI builtins.
test("ASSISTANT_DISALLOWED_TOOLS also blocks the other host-CLI write and background-shell builtins: MultiEdit, NotebookEdit, BashOutput, KillShell", () => {
  for (const tool of ["MultiEdit", "NotebookEdit", "BashOutput", "KillShell"]) {
    assert.equal(ASSISTANT_DISALLOWED_TOOLS.includes(tool), true, `${tool} must be on ASSISTANT_DISALLOWED_TOOLS`);
  }
});

// Owner rule: the agent must never read the site key. The CLI runs under bypassPermissions with a
// production cwd that contains sites/.tovu, so its built-in Read/Grep/Glob would otherwise walk
// straight past the fs-files denylist. Grep and Glob honour Read() deny rules; `//` is an absolute
// pattern, so `//**/.tovu/**` covers the folder at any depth, cwd or home alike.
test("ASSISTANT_DISALLOWED_TOOLS denies Read on the .tovu folder at any depth, in home, on legacy key filenames, and on /proc", () => {
  assert.deepEqual(
    ASSISTANT_DISALLOWED_TOOLS.filter((rule) => rule.includes("(")).sort(),
    [
      "Read(//**/.tovu/**)",
      "Read(~/.tovu/**)",
      "Read(//**/*-key*.hex)",
      "Read(//proc/**)",
    ].sort(),
  );
});

test("ASSISTANT_DISALLOWED_TOOLS does not name a tool the assistant has real observed use of (Read, ToolSearch, or Tovu's own catalog names)", () => {
  for (const usedTool of ["Read", "ToolSearch", "search_tools", "describe_tool", "execute_delegated_tool"]) {
    assert.equal(ASSISTANT_DISALLOWED_TOOLS.includes(usedTool), false, `${usedTool} has real observed use in chat.db and must not be restricted`);
  }
});

// Owner call 2026-09-28: assistant runs load none of the CLI's own settings layers, so the operator's
// personal ~/.claude hooks, plugins and defaults (and the repo's own .claude hooks) never reach them.
test("ASSISTANT_SETTING_SOURCES is empty: an assistant run loads no user, project or local CLI settings", () => {
  assert.deepEqual([...ASSISTANT_SETTING_SOURCES], []);
});

// With every settings layer off, the owner's search guard (~/.claude/hooks/no-system-search) is
// handed back through `--settings` with its exact user-settings entry, alongside auto-memory off.
test("resolveAssistantRunSettings: auto-memory is disabled alongside the no-system-search hook, same matcher and timeout", () => {
  const hook = "/home/op/.claude/hooks/no-system-search";
  const settings = resolveAssistantRunSettings("/home/op", (p) => p === hook);
  assert.deepEqual(JSON.parse(settings), {
    autoMemoryEnabled: false,
    hooks: { PreToolUse: [{ matcher: "Bash|Glob|Grep", hooks: [{ type: "command", command: hook, timeout: 5 }] }] },
  });
});

test("resolveAssistantRunSettings: absent hook still disables auto-memory without adding hooks", () => {
  assert.equal(resolveAssistantRunSettings("/home/op", () => false), '{"autoMemoryEnabled":false}');
});

test("published content guidance prioritizes the live URL and requires explicit overwrite", () => {
  const overlay = buildBaseSystemOverlay(false);
  assert.match(overlay, /publicUrl first/);
  assert.match(overlay, /adminUrl is only a secondary edit link/);
  assert.match(overlay, /overwrite:true only when the user explicitly asked/);
});

test("default prompt describes the enforced host tool grant", () => {
  assert.equal(ASSISTANT_DISALLOWED_TOOLS.includes("Bash"), true);
  const overlay = buildBaseSystemOverlay(false);
  assert.equal(overlay.includes("Bash is unavailable because it is disabled for this assistant."), true);
  assert.equal(overlay.includes("Bash and file access remain available"), false);
  assert.equal(overlay.includes("Read remains available only for reading Tovu's own source"), true);
});

test("every overlay tells the model to batch the same operation on several items into one items call", () => {
  assert.match(BATCH_GUIDANCE, /same operation to several items, pass them as items: \[\{\.\.\.\}, \.\.\.\] in ONE call/);
  for (const overlay of [buildBaseSystemOverlay(false), buildBaseSystemOverlay(true), buildBaseSystemOverlay(false, { nativeToolAccess: true })]) {
    assert.ok(overlay.includes(BATCH_GUIDANCE));
  }
});

test("buildBashGuidanceBlock: the live grant disallows Bash, so the default block is the 'unavailable' text", () => {
  assert.ok(ASSISTANT_DISALLOWED_TOOLS.includes("Bash"));
  assert.equal(BASH_GUIDANCE_BLOCK, buildBashGuidanceBlock(ASSISTANT_DISALLOWED_TOOLS));
  assert.ok(BASH_GUIDANCE_BLOCK.startsWith("Bash is unavailable because it is disabled for this assistant. "));
});

test("buildBashGuidanceBlock: a grant that leaves Bash available narrows it to reading Tovu's own source", () => {
  const text = buildBashGuidanceBlock(["Write", "Edit"]);
  assert.ok(text.startsWith("Bash and file access remain available for one narrow purpose: reading Tovu's own source"));
  assert.ok(text.endsWith("you are about to do it the wrong way — search_tools again instead. "));
  assert.notEqual(text, BASH_GUIDANCE_BLOCK);
});
