import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import type { SurfaceEmitter, ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { installAgentPlugin, type AgentPluginArchiveReaderPort } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { pluginMemory } from "../../memory.js";
import { pluginNoteHandler } from "../../write-note-tool.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { operatorLocaleLedger } from "../fixtures/operator-locale-ledger.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file `agent_plugin_write_note`'s handler against a real temp-dir plugin install, the real
 * shared exchange store and a hand-written authorize fake: direct writes, input refusals,
 * installed-plugin authorization and aborts. Notes are context, never a permission grant.
 */

const WORKSPACE = "ws-notes";
const PRINCIPAL = "operator-1";

async function setup(t: TestContext, options: { allow?: boolean; locale?: string; instanceLayout?: boolean } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "plugin-write-note-")));
  t.after(() => forceRemove(root));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: root } });
  const archive = Buffer.from("example-note-plugin");
  const files: Record<string, string> = {
    "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "example", version: "1.0.0" }),
    "skills/example/SKILL.md": "# example\nInstructions.",
  };
  const archiveReader: AgentPluginArchiveReaderPort = { async *entries() {
    for (const [entryPath, text] of Object.entries(files)) yield { kind: "file", entryPath, async *openReadStream() { yield Buffer.from(text); } };
  } };
  await installAgentPlugin({ layout, workspaceId: WORKSPACE, archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  let settingsRepo: unknown;
  if (options.locale) {
    const ledger = await operatorLocaleLedger(WORKSPACE);
    await ledger.saveOperatorLocale(PRINCIPAL, options.locale);
    settingsRepo = ledger.settingsRepo;
  }
  const deps = {
    workspaceId: WORKSPACE,
    authorize: async () => (options.allow === false ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" }),
    ...(settingsRepo ? { settingsRepo } : {}),
  } as never;
  if (options.instanceLayout) {
    const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
    process.env.TOVU_AGENT_PLUGINS_DIR = root;
    t.after(() => { if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous; });
  }
  const handler = pluginNoteHandler({ deps, surfaces: { surfaceExchanges } }, options.instanceLayout ? {} : { layout });
  return { layout, surfaceExchanges, handler };
}

function ctxFor(input: unknown, signal = new AbortController().signal): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL }, run: { id: "run-1" }, input, signal } as ToolExecutionContext;
}

const NOTE = { pluginId: "example", entryPath: "brand.md", text: "Use the teal logo." };

test("ordinary note save runs directly, preserves bytes and opens no exchange", async t => {
  const h = await setup(t);
  assert.deepEqual(await h.handler(ctxFor(NOTE), { emitSurface: async () => assert.fail("ordinary notes never ask") }), { saved: true, relativePath: "brand.md", bytes: Buffer.byteLength(NOTE.text) });
  assert.equal(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).read({ kind: "notes", entryPath: "brand.md" }), NOTE.text);
  assert.equal(h.surfaceExchanges.size(), 0);
});

test("without a layout option the handler uses this instance's Agent Plugins layout", async t => {
  const h = await setup(t, { instanceLayout: true });
  assert.equal((await h.handler(ctxFor(NOTE)) as { saved: boolean }).saved, true);
  assert.equal(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).read({ kind: "notes", entryPath: "brand.md" }), NOTE.text);
});

test("an aborted note saves nothing", async t => {
  const h = await setup(t);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await h.handler(ctxFor(NOTE, controller.signal)), { saved: false, reason: "abandoned" });
  assert.deepEqual(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).list({ kind: "notes" }), []);
});

test("input refusals happen before any dialog", async t => {
  const h = await setup(t);
  const cases: Array<[unknown, RegExp | string]> = [
    [{ ...NOTE, extra: 1 }, "Unexpected note field"],
    [{ ...NOTE, text: 5 }, /text/],
    [{ ...NOTE, entryPath: "../escape.md" }, /./],
    [{ ...NOTE, text: "x".repeat(DEFAULT_PLUGIN_MEMORY_LIMITS.notes + 1) }, "Note is not valid bounded UTF-8 text"],
    [{ ...NOTE, text: "nul\0byte" }, "Note is not valid bounded UTF-8 text"],
    [{ ...NOTE, pluginId: "not-installed" }, "Agent Plugin is not installed"],
  ];
  for (const [input, message] of cases) {
    const emitSurface: SurfaceEmitter = async () => assert.fail("no dialog may be raised");
    await assert.rejects(h.handler(ctxFor(input), { emitSurface }), typeof message === "string" ? { message } : message, JSON.stringify(input).slice(0, 60));
  }
});

test("an operator without admin.plugins.enable is refused before the install check", async t => {
  const h = await setup(t, { allow: false });
  await assert.rejects(h.handler(ctxFor(NOTE), { emitSurface: async () => assert.fail("no dialog") }), /admin\.plugins\.enable/);
});
