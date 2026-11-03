import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { appendHostDeployNotes, HOST_DEPLOY_ENV, type RenderedDeployConfig } from "../deploy-config.js";

/**
 * @file Tovu's half of a deploy config once the generators are host-neutral Jini plugins: the
 * production switch Tovu passes in `options.env`, and the host notes appended from each plugin's
 * overlay `deploy-notes.json` after render.
 */

const REPO_OVERLAYS = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugin-overlays");
const rendered: RenderedDeployConfig = { filename: "render.yaml", contents: "x", notes: ["generator note"] };

/** A fake file port over an in-memory map. */
function files(entries: Record<string, string>): (file: string) => string | undefined {
  return (file) => entries[file];
}

test("HOST_DEPLOY_ENV is Tovu's production switch, frozen", () => {
  assert.deepEqual(HOST_DEPLOY_ENV, { TOVU_RUNTIME_MODE: "production" });
  assert.ok(Object.isFrozen(HOST_DEPLOY_ENV));
});

test("appends the overlay's notes for the target after the generator's, by plugin name (publisher id or bare)", () => {
  const readFile = files({ "/o/render/deploy-notes.json": JSON.stringify({ render: ["host note"] }) });
  for (const pluginId of ["render", "tovu/render"]) {
    const result = appendHostDeployNotes({ pluginId, targetId: "render", rendered }, { overlaysDir: "/o", readFile });
    assert.deepEqual(result.notes, ["generator note", "host note"]);
    assert.equal(result.contents, "x");
  }
});

test("a note the generator already printed is not repeated (the pre-cutover bundled generators print it)", () => {
  const readFile = files({ "/o/render/deploy-notes.json": JSON.stringify({ render: ["generator note"] }) });
  assert.equal(appendHostDeployNotes({ pluginId: "render", targetId: "render", rendered }, { overlaysDir: "/o", readFile }), rendered);
});

test("no overlay file, or no entry for this target, leaves the rendered config unchanged", () => {
  assert.equal(appendHostDeployNotes({ pluginId: "fly", targetId: "fly", rendered }, { overlaysDir: "/o", readFile: files({}) }), rendered);
  const readFile = files({ "/o/cloudflare/deploy-notes.json": JSON.stringify({ "cloudflare-pages": ["p"] }) });
  assert.equal(appendHostDeployNotes({ pluginId: "cloudflare", targetId: "cloudflare-workers", rendered }, { overlaysDir: "/o", readFile }), rendered);
});

test("a malformed notes entry fails loudly, naming the file", () => {
  const readFile = files({ "/o/fly/deploy-notes.json": JSON.stringify({ fly: "not an array" }) });
  assert.throws(() => appendHostDeployNotes({ pluginId: "fly", targetId: "fly", rendered }, { overlaysDir: "/o", readFile }), /\/o\/fly\/deploy-notes\.json must map each target id/);
});

test("a malformed deploy notes document fails loudly instead of silently dropping host notes", () => {
  for (const document of [[], null, false, 42, "notes"]) {
    const readFile = files({ "/o/fly/deploy-notes.json": JSON.stringify(document) });
    assert.throws(() => appendHostDeployNotes({ pluginId: "fly", targetId: "fly", rendered }, { overlaysDir: "/o", readFile }), /\/o\/fly\/deploy-notes\.json must map each target id/);
  }
});

test("only an own deploy target entry contributes host notes", () => {
  const readFile = files({ "/o/fly/deploy-notes.json": "{}" });
  assert.equal(appendHostDeployNotes({ pluginId: "fly", targetId: "constructor", rendered }, { overlaysDir: "/o", readFile }), rendered);
});

test("Tovu's real fly, render and railway overlays each add the headless-Chromium opt-in for their own target", () => {
  for (const id of ["fly", "render", "railway"]) {
    const result = appendHostDeployNotes({ pluginId: `tovu/${id}`, targetId: id, rendered }, { overlaysDir: REPO_OVERLAYS });
    assert.equal(result.notes.length, 2, id);
    assert.match(result.notes[1]!, /^Headless Chromium is not installed by default\..*TOVU_INSTALL_BROWSER/, id);
  }
});
