import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { DEFAULT_PLUGIN_MEMORY_LIMITS } from "@jini-ai/agent-plugins/persistent-state";
import type { SurfaceEmitter, ToolExecutionContext } from "@jini-ai/core";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { installAgentPlugin, type AgentPluginArchiveReaderPort } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { pluginMemory } from "../../memory.js";
import { uninstallAgentPlugin } from "../../uninstall.js";
import { pluginNoteHandler, WRITE_PLUGIN_NOTE } from "../../write-note-tool.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { operatorLocaleLedger } from "../fixtures/operator-locale-ledger.js";

/**
 * @file `agent_plugin_write_note`'s handler against a real temp-dir plugin install, the real
 * held-open confirmation exchange and a hand-written authorize fake: input refusals, the installed
 * check on both sides of the dialog, cancel and confirm, and the dialog copy in the operator's
 * admin language.
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
  const surfaceExchanges = createSurfaceExchangeStore();
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

/** Runs the handler, answers the dialog it raises with `decision`, and returns the result and dialog html. */
async function answer(h: Awaited<ReturnType<typeof setup>>, input: unknown, decision: "confirm" | "cancel", beforeAnswer: () => Promise<void> = async () => {}) {
  let resolveSurface: (surface: unknown) => void = () => {};
  const raised = new Promise<unknown>(resolve => { resolveSurface = resolve; });
  const emitSurface: SurfaceEmitter = async (surface) => { resolveSurface(surface); };
  const pending = h.handler(ctxFor(input), { emitSurface });
  pending.catch(() => {});
  const surface = await Promise.race([raised, pending.then(() => assert.fail("no dialog was raised"))]);
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))?.[1];
  assert.ok(exchangeId);
  await beforeAnswer();
  assert.equal(h.surfaceExchanges.deliver({ exchangeId, params: { decision }, principalId: PRINCIPAL, toolId: WRITE_PLUGIN_NOTE }).ok, true);
  return { result: pending, html };
}

const NOTE = { pluginId: "example", entryPath: "brand.md", text: "Use the teal logo." };

test("confirming saves the note into the plugin's notes and reports it", async t => {
  const h = await setup(t);
  const { result, html } = await answer(h, NOTE, "confirm");
  assert.deepEqual(await result, { saved: true, relativePath: "brand.md", bytes: Buffer.byteLength("Use the teal logo.") });
  assert.equal(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).read({ kind: "notes", entryPath: "brand.md" }), "Use the teal logo.");
  assert.match(html, /Save plugin note\?/);
  assert.match(html, />Save note</);
  assert.match(html, /<dt>File<\/dt><dd>brand\.md<\/dd>/);
  assert.match(html, /<dt>Note<\/dt><dd>Use the teal logo\.<\/dd>/);
});

test("without a layout option the handler uses this instance's Agent Plugins layout", async t => {
  const h = await setup(t, { instanceLayout: true });
  const { result } = await answer(h, NOTE, "confirm");
  assert.equal((await result as { saved: boolean }).saved, true);
  assert.equal(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).read({ kind: "notes", entryPath: "brand.md" }), "Use the teal logo.");
});

test("cancelling saves nothing and says why", async t => {
  const h = await setup(t);
  const { result } = await answer(h, NOTE, "cancel");
  assert.deepEqual(await result, { saved: false, reason: "declined" });
  assert.deepEqual(await pluginMemory({ workspaceId: WORKSPACE, pluginId: "example" }, { layout: h.layout }).list({ kind: "notes" }), []);
});

test("a plugin uninstalled while the dialog was open is refused instead of saved", async t => {
  const h = await setup(t);
  const { result } = await answer(h, NOTE, "confirm", () => uninstallAgentPlugin({ layout: h.layout, workspaceId: WORKSPACE, pluginId: "example" }).then(() => {}));
  await assert.rejects(result, { message: "Plugin was uninstalled while the note was being confirmed" });
});

test("the dialog copy follows the operator's saved admin language", async t => {
  const h = await setup(t, { locale: "es" });
  const { result, html } = await answer(h, NOTE, "cancel");
  await result;
  assert.match(html, /¿Guardar nota del plugin\?/);
  assert.match(html, />Guardar nota</);
  assert.match(html, /<dt>Archivo<\/dt><dd>brand\.md<\/dd>/);
  assert.match(html, /<dt>Nota<\/dt>/);
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
