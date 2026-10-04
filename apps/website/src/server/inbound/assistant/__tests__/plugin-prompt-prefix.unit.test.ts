import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";

import { assemblePromptWithPluginPrefix, resolveAgentPluginPromptPrefix } from "../plugin-prompt-prefix.js";

/**
 * @file Closes the gap named in this dispatch's brief: nothing tested `agent-daemon-server.ts`'s
 * own `onStarted` — specifically the two lines that resolve a run's pinned Agent Plugin refs and
 * prepend the result onto the run's prompt (`prompt = `${pluginPromptPrefix}\n\n${prompt}``).
 * `resolve-agent-plugin-refs.real-install.unit.test.ts` already proves `resolveAgentPluginRefs`
 * itself works against the real on-disk install; this file proves the DAEMON'S OWN wrapper around
 * that call — workspace-layout resolution, the run-failure branch, and the prepend — which no
 * existing test touched.
 *
 * `agent-daemon-server.ts` cannot be imported directly to reach `onStarted`: it is a flat
 * top-level script with import-time side effects (opens a real SQLite connection, builds the
 * tool registry, boots MCP federation — see its own module doc and the sibling
 * `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts`, which reads its SOURCE for the
 * same reason). `resolveAgentPluginPromptPrefix` and `assemblePromptWithPluginPrefix` were moved
 * out of `onStarted`'s neighborhood into `../plugin-prompt-prefix.ts` — a module with NO
 * import-time side effects — specifically so this file can import and call the REAL functions
 * the daemon runs, not a reimplementation of them.
 *
 * `RunLifecycle` is the REAL `@jini-ai/daemon` in-memory implementation, not a hand-rolled fake —
 * `createRunLifecycle({ eventLog: createInMemoryEventLog() })` is exactly what
 * `agent-daemon-server.ts` itself constructs at module scope. Using the real thing means the
 * failure-path assertions below prove the run genuinely transitions to `'failed'` via a real
 * `finish()` call, not that a mock recorded being called.
 */

const WORKSPACE_ID = "workspace-local";
const PLUGIN_ID = "ui-ux-design";

async function isolatedPluginRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-prompt-prefix-"));
  const previousRoot = process.env.TOVU_AGENT_PLUGINS_DIR;
  const previousDelivery = process.env.TOVU_AGENT_PLUGIN_DELIVERY;
  process.env.TOVU_AGENT_PLUGINS_DIR = root;
  process.env.TOVU_AGENT_PLUGIN_DELIVERY = "inject";
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previousRoot;
    if (previousDelivery === undefined) delete process.env.TOVU_AGENT_PLUGIN_DELIVERY;
    else process.env.TOVU_AGENT_PLUGIN_DELIVERY = previousDelivery;
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function newRealLifecycleWithRun() {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  await lifecycle.rehydrate();
  const { run } = await lifecycle.start({ contextRef: "plugin-prompt-prefix.unit.test" });
  return { lifecycle, run };
}

test("assemblePromptWithPluginPrefix leaves the base prompt untouched when the prefix is empty (the common no-plugin-pinned case)", () => {
  assert.equal(assemblePromptWithPluginPrefix("what should I write next?", ""), "what should I write next?");
});

test("assemblePromptWithPluginPrefix prepends a non-empty prefix with exactly one blank-line separator", () => {
  const result = assemblePromptWithPluginPrefix("what should I write next?", "<<AGENT_PLUGIN pluginId=\"ui-ux-design\">>...");
  assert.equal(result, "<<AGENT_PLUGIN pluginId=\"ui-ux-design\">>...\n\nwhat should I write next?");
});

test("resolveAgentPluginPromptPrefix resolves to an empty prefix and never touches the filesystem when pluginRefIds is empty", async () => {
  const { lifecycle, run } = await newRealLifecycleWithRun();

  // A workspace id that has no directory on disk at all — if this function attempted any
  // filesystem access on the empty-refs path, `resolveAgentPluginLayout().forWorkspace()` would
  // still succeed (it only computes a path), but `resolveAgentPluginRefs` would be called and
  // could throw or behave unexpectedly against a nonexistent tree. Passing a bogus workspace id
  // and still getting a clean `""` back is evidence the empty-array fast path returned before any
  // of that ran, matching `resolveAgentPluginRefs`'s own documented empty-array fast path.
  const result = await resolveAgentPluginPromptPrefix(run, [], lifecycle, "definitely-not-a-real-workspace-id");

  assert.equal(result, "");
  const status = await lifecycle.get({ runId: run.id });
  assert.equal(status?.state, "running", "an empty-refs run must not be touched by plugin resolution at all");
});

test("resolveAgentPluginPromptPrefix resolves an isolated installed ui-ux-design SKILL.md and the daemon's own prepend puts it before the base prompt", async (t) => {
  const { lifecycle, run } = await newRealLifecycleWithRun();

  const root = await isolatedPluginRoot(t);
  const packageDir = path.join(root, "ws", WORKSPACE_ID, "packages", "sha256", "a".repeat(64));
  const skillDir = path.join(packageDir, "skills", PLUGIN_ID);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(packageDir, "plugin.json"), JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN_ID, version: "1.0.0",
  }));
  await writeFile(path.join(root, "ws", WORKSPACE_ID, "activations.json"), JSON.stringify({
    schemaVersion: 1, plugins: { [PLUGIN_ID]: { enabled: true, origin: "operator-installed", updatedAt: "2026-10-03T00:00:00.000Z", updatedBy: "fixture" } },
  }));
  const skillPath = path.join(skillDir, "SKILL.md");
  await writeFile(skillPath, "# UI/UX Design\n\nUse an 8px grid and give controls visible focus rings.\n");
  const realSkillMarkdown = await readFile(skillPath, "utf8");

  const pluginPromptPrefix = await resolveAgentPluginPromptPrefix(run, [PLUGIN_ID], lifecycle, WORKSPACE_ID);

  assert.notEqual(pluginPromptPrefix, null, "resolution against a real, correctly installed plugin must not fail the run");
  const prefix = pluginPromptPrefix as string;
  assert.ok(
    prefix.includes(realSkillMarkdown),
    "resolved prefix does not contain the exact real SKILL.md bytes read independently from disk",
  );

  // The run must still be non-terminal — a successful resolution must not itself finish the run
  // (only `onStarted`'s later `agentExecutor.run()` call does that).
  const statusAfterSuccess = await lifecycle.get({ runId: run.id });
  assert.equal(statusAfterSuccess?.state, "running");

  // The exact two-line sequence `onStarted` runs after this call: prepend, then use the result as
  // the run's actual prompt.
  const basePrompt = "what should I write next for the coffee shop's About page?";
  const finalPrompt = assemblePromptWithPluginPrefix(basePrompt, prefix);

  assert.ok(finalPrompt.startsWith(prefix), "the resolved plugin prefix must lead the final prompt");
  assert.equal(finalPrompt, `${prefix}\n\n${basePrompt}`);
  assert.ok(finalPrompt.includes(realSkillMarkdown), "the final assembled prompt must carry the real installed skill text");
});

test("resolveAgentPluginPromptPrefix fails the run closed (via the REAL lifecycle) when a pinned pluginRefId is not installed", async (t) => {
  await isolatedPluginRoot(t);
  const { lifecycle, run } = await newRealLifecycleWithRun();

  const result = await resolveAgentPluginPromptPrefix(run, ["not-a-real-installed-plugin-id"], lifecycle, WORKSPACE_ID);

  assert.equal(result, null, "an unresolvable pinned plugin ref must abort prompt assembly, not silently continue unaugmented");

  // Proves the run was ACTUALLY finished as 'failed' through the real lifecycle — not that a mock
  // recorded a call. A pinned plugin silently not reaching the agent (a run that looks like it
  // just... started running with an ordinary prompt) is exactly the confusing failure mode this
  // function's own module doc says it exists to avoid.
  const status = await lifecycle.get({ runId: run.id });
  assert.equal(status?.state, "failed");
});

test("resolveAgentPluginPromptPrefix tells the user why the run could not start (an error event before end)", async (t) => {
  await isolatedPluginRoot(t);
  const { lifecycle, run } = await newRealLifecycleWithRun();

  await resolveAgentPluginPromptPrefix(run, ["not-a-real-installed-plugin-id"], lifecycle, WORKSPACE_ID);

  const kinds: string[] = [];
  const errors: unknown[] = [];
  await lifecycle.stream(run.id, (event) => {
    kinds.push(event.kind);
    if (event.kind === "error") errors.push(event.payload);
  });
  assert.deepEqual(kinds.slice(-2), ["error", "end"]);
  assert.deepEqual(errors, [
    { message: "The assistant could not start: a selected Agent Plugin could not be loaded. Remove it from the message or reinstall it, then send again." },
  ]);
});
