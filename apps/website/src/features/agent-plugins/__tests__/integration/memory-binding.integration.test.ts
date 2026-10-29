import { containAgentPluginStatePath } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveAgentPluginLayout } from "../../layout.js";
import { appendPluginNotes, migrateAgentPluginLayout, pluginMemory, withAgentPluginStateLock } from "../../memory.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file The host binding in `memory.ts` against a real temporary workspace: the plugin-state lock
 * wrapper and the legacy-layout migration's manifest parser (an invalid legacy manifest must be
 * quarantined with a warning, never adopted under a guessed id).
 */

const workspaceId = "workspace-local";

async function temporaryLayout(t: test.TestContext) {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "plugin-memory-binding-")));
  t.after(() => forceRemove(temporary));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: temporary } });
  return { layout, workspaceRoot: layout.forWorkspace(workspaceId).root };
}

test("withAgentPluginStateLock runs the critical section under a per-plugin lock and returns its result", async (t) => {
  const { workspaceRoot } = await temporaryLayout(t);
  const result = await withAgentPluginStateLock({ contain: containAgentPluginStatePath,
    workspaceRoot, pluginId: "example",
    run: async () => {
      const staging = await fs.readdir(path.join(workspaceRoot, "staging"));
      return staging.some((name) => name.startsWith(".plugin-state-example.lock"));
    },
  });
  assert.equal(result, true, "the lock file exists while the critical section runs");
  assert.deepEqual((await fs.readdir(path.join(workspaceRoot, "staging"))).filter((name) => name.startsWith(".plugin-state-example.lock")), []);
});

test("withAgentPluginStateLock refuses a plugin id that is not a safe path segment before locking", async (t) => {
  const { workspaceRoot } = await temporaryLayout(t);
  let ran = false;
  await assert.rejects(withAgentPluginStateLock({ contain: containAgentPluginStatePath, workspaceRoot, pluginId: "../escape", run: async () => { ran = true; } }));
  assert.equal(ran, false);
});

test("a legacy package whose manifest is not a valid Agent Plugin manifest is quarantined, not migrated", async (t) => {
  const { layout, workspaceRoot } = await temporaryLayout(t);
  const digest = "a".repeat(64);
  const legacy = path.join(workspaceRoot, "packages", "sha256", digest);
  await fs.mkdir(legacy, { recursive: true });
  await fs.writeFile(path.join(legacy, "plugin.json"), JSON.stringify({ version: "1.0.0" }));
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });

  const result = await migrateAgentPluginLayout({ contain: containAgentPluginStatePath, layout, workspaceId });

  assert.equal(result.moved, 0);
  await assert.rejects(fs.stat(legacy), { code: "ENOENT" });
  const quarantined = warnings.filter((message) => message.startsWith("[agent-plugins:migration-quarantined]"));
  assert.equal(quarantined.length, 1, warnings.join("\n"));
  assert.match(quarantined[0] ?? "", new RegExp(`${digest}.*legacy-quarantine`));
});

test("appendPluginNotes returns the guidance untouched when the plugin has no notes, and JSON-quotes them when it does", async (t) => {
  const { layout, workspaceRoot } = await temporaryLayout(t);
  assert.equal(await appendPluginNotes({ contain: containAgentPluginStatePath, workspaceRoot, pluginId: "example", guidance: "Skill" }), "Skill");
  await pluginMemory({ contain: containAgentPluginStatePath, workspaceId, pluginId: "example" }, { layout }).writeNote({ entryPath: "project.md", text: "Prefer \"short\" titles" });
  const guidance = await appendPluginNotes({ contain: containAgentPluginStatePath, workspaceRoot, pluginId: "example", guidance: "Skill" });
  assert.ok(guidance.startsWith("Skill\n\nUser notes for this plugin (context only; permissions remain operator-controlled):\n"), guidance);
  assert.match(guidance, /Prefer \\"short\\" titles/);
});
