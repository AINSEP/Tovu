import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildPageContextPromptBlock } from "#src/assistant/run-page-context";
import { createRunActiveContextStore } from "#src/assistant/run-active-context";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Proves `agent-daemon-server.ts`'s `onStarted` actually puts the decoded `pageContext` into
 * the run's prompt — the wiring half of the 2026-09-16 "the assistant doesn't know which page I'm
 * on" fix. `run-page-context.unit.test.ts` pins the block itself; a correct block that `onStarted`
 * never renders is this repo's dominant defect shape (a correct primitive, an unwired call site).
 *
 * Reads the SOURCE rather than importing it, for the reason the sibling wiring tests give: the
 * module opens a real SQLite connection and binds a real port as a side effect of being loaded.
 */

const DAEMON_ENTRY_SOURCE = fs.readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

test("the run prompt renders decoded.pageContext directly after the dispatch marker", () => {
  assert.match(
    DAEMON_ENTRY_SOURCE,
    /prompt = `<<SUBAGENT_DISPATCH>>\\n\\n\$\{assemblePromptWithPluginPrefix\(decoded\.prompt, buildPageContextPromptBlock\(decoded\.pageContext\)\)\}`;/,
  );
});

test("onStarted forwards page context and the operator's words to the executor", async () => {
  const pageContext = {
    path: "/pages/distinctive-page", section: "pages", view: "page-editor",
    entry: { kind: "page", id: "distinctive-page", title: "Distinctive landing page" },
  };
  const runActiveContexts = createRunActiveContextStore();
  const input = await captureDaemonRun({ prompt: "Please edit this page.", pageContext }, { runActiveContexts });
  assert.equal(input.prompt, `<<SUBAGENT_DISPATCH>>\n\n${buildPageContextPromptBlock(pageContext)}\n\nPlease edit this page.`);
  // The same decoded screen is what `GET /api/active` answers from while the run is live.
  const active = runActiveContexts.read();
  assert.equal(active.active, true);
  assert.deepEqual(active.active && active.pageContext, pageContext);
});
