import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { getAgentDef } from "@jini-ai/agent-runtime";
import { ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES } from "../assistant-system-overlay.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Wiring proof for Finding 2 of SEC-assistant-env-isolation-2026-09-07: reads the SOURCE of
 * `agent-daemon-server.ts` rather than importing it, same reason and same style as
 * `agent-daemon-server.session-resume-wiring.unit.test.ts` next to this file (that file opens a
 * real SQLite connection and binds a real port as an import-time side effect).
 *
 * A restricted-tool constant that exists but is never passed into `agentExecutor.run()` would leave
 * the assistant exactly as unrestricted as before the fix, even though `ASSISTANT_DISALLOWED_TOOLS`
 * itself (asserted directly in `assistant-system-overlay.unit.test.ts`) is correct in isolation —
 * this file is the one that would fail if that wiring were ever removed or the field were renamed
 * without updating the runtime plumbing (`AgentExecutorRunInput.disallowedTools`).
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

describe("Finding 2 wiring — the spawned assistant's tool grant is actually restricted, not just prompted", () => {
  test("imports ASSISTANT_DISALLOWED_TOOLS from assistant-system-overlay.ts", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*ASSISTANT_DISALLOWED_TOOLS[^}]*\}\s*from\s*["'][^"']*assistant-system-overlay(\.js)?["']/,
      "agent-daemon-server.ts must import ASSISTANT_DISALLOWED_TOOLS from assistant-system-overlay.ts, not hardcode a second copy of the list",
    );
  });

  test("agentExecutor.run() is called with disallowedTools: ASSISTANT_DISALLOWED_TOOLS", () => {
    const runCallIndex = DAEMON_ENTRY_SOURCE.indexOf("await agentExecutor.run({");
    assert.ok(runCallIndex > -1, "this test's own anchor (the agentExecutor.run call) must still exist verbatim");

    // Scope the search to the run() call's own argument object, not the whole file, so a
    // coincidental match elsewhere (a comment, an unrelated constant) cannot make this pass by
    // accident. The call's closing `});` is the next occurrence after the anchor.
    const closeIndex = DAEMON_ENTRY_SOURCE.indexOf("});", runCallIndex);
    assert.ok(closeIndex > runCallIndex, "this test's own anchor (the agentExecutor.run call's closing brace) must still exist verbatim");
    const runCallBody = DAEMON_ENTRY_SOURCE.slice(runCallIndex, closeIndex);

    assert.match(
      runCallBody,
      /disallowedTools\s*:\s*ASSISTANT_DISALLOWED_TOOLS\s*,/,
      "the agentExecutor.run() call must pass disallowedTools: ASSISTANT_DISALLOWED_TOOLS unconditionally — without this, Finding 2 is built but never actually applied to a live run",
    );
  });

  test("agentExecutor.run() is handed resolveAssistantRunSettings()'s hook settings", () => {
    const runCallIndex = DAEMON_ENTRY_SOURCE.indexOf("await agentExecutor.run({");
    const runCallBody = DAEMON_ENTRY_SOURCE.slice(runCallIndex, DAEMON_ENTRY_SOURCE.indexOf("});", runCallIndex));
    assert.match(
      runCallBody,
      /resolveAssistantRunSettings\(/,
      "the agentExecutor.run() call must pass resolveAssistantRunSettings()'s result — without it the no-system-search hook never runs in assistant turns",
    );
  });

  test("agentExecutor.run() is called with settingSources: ASSISTANT_SETTING_SOURCES", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*ASSISTANT_SETTING_SOURCES[^}]*\}\s*from\s*["'][^"']*assistant-system-overlay(\.js)?["']/,
      "agent-daemon-server.ts must import ASSISTANT_SETTING_SOURCES from assistant-system-overlay.ts",
    );
    const runCallIndex = DAEMON_ENTRY_SOURCE.indexOf("await agentExecutor.run({");
    const runCallBody = DAEMON_ENTRY_SOURCE.slice(runCallIndex, DAEMON_ENTRY_SOURCE.indexOf("});", runCallIndex));
    assert.match(
      runCallBody,
      /settingSources\s*:\s*ASSISTANT_SETTING_SOURCES\s*,/,
      "the agentExecutor.run() call must pass settingSources: ASSISTANT_SETTING_SOURCES — without it the operator's personal CLI hooks and plugins run inside every assistant turn",
    );
  });
});

test("onStarted hands the executor the enforced tool restrictions", async () => {
  const input = await captureDaemonRun({ prompt: "Review this page" });
  assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
  assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
});

test("onStarted forwards the exact search hook settings through to Claude launch arguments", async () => {
  const input = await captureDaemonRun({ prompt: "Find a page" }, { hookPresent: true });
  assert.ok(input.settings);
  assert.deepEqual(JSON.parse(input.settings), {
    hooks: { PreToolUse: [{ matcher: "Bash|Glob|Grep", hooks: [
      { type: "command", command: "/home/daemon-test/.claude/hooks/no-system-search", timeout: 5 },
    ] }] },
  });
  const def = getAgentDef("claude");
  assert.ok(def);
  const args = def.buildArgs(input.prompt, [], [], input);
  const settingsIndex = args.indexOf("--settings");
  assert.ok(settingsIndex >= 0);
  assert.equal(args[settingsIndex + 1], input.settings);
});

test("onStarted omits hook settings when the hook file is absent", async () => {
  const input = await captureDaemonRun({ prompt: "Find a page" });
  assert.equal(Object.hasOwn(input, "settings"), false);
});
