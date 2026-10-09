import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initSite } from "../../init-site.js";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { createProgram } from "#src/cli/program";

const sampleTitles = [
  "Welcome to Tovu", "What Is Tovu?", "How Themes Work", "How Plugins Work", "The Plugin API",
  "Self-Hosting — Coming Soon", "Field Notes: The Weight of Type", "Slow Mornings",
].sort();

// Open through the real boot boundary: the fallback demo seed must never repopulate a blank site.
for (const kind of ["sqlite", "pglite"] as const) {
  test(`new ${kind} site has zero entries after init and two boots`, async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "tovu-blank-site-"));
    const dir = path.join(parent, "blank");
    try {
      await initSite({ dir, storage: { kind } });
      for (let boot = 0; boot < 2; boot += 1) {
        const store = await openSiteStore({ storage: { kind }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
        try {
          assert.deepEqual(await store.content.run((db) => db.selectFrom("posts").selectAll().execute()), []);
          const workspaces = await store.content.run((db) => db.selectFrom("workspaces").select("id").execute());
          const presentation = await store.content.run((db) => db.selectFrom("presentation_settings").select("active_theme_id").execute());
          assert.deepEqual(workspaces, [{ id: "workspace-local" }]);
          assert.deepEqual(presentation, [{ active_theme_id: "tovu-starter" }]);
        } finally { await store.close(); }
      }
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
}

for (const withSampleContent of [false, true]) {
  test(`CLI init sample-content opt-in=${withSampleContent} reaches the real template seed`, async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "tovu-cli-seed-"));
    const dir = path.join(parent, "cli-site");
    try {
      await createProgram().parseAsync(["init", dir, ...(withSampleContent ? ["--with-sample-content"] : [])], { from: "user" });
      const store = await openSiteStore({ storage: { kind: "sqlite" }, dbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db"), role: "owner" });
      try {
        const entries = await store.content.run((db) => db.selectFrom("posts").select(["title", "kind"]).execute());
        assert.deepEqual(entries.filter((entry) => entry.kind === "post").map((entry) => entry.title).sort(), withSampleContent ? sampleTitles : []);
        assert.equal(entries.filter((entry) => entry.kind === "page").length, withSampleContent ? 2 : 0);
      } finally { await store.close(); }
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
}
