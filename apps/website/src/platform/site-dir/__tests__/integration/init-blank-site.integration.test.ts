import "../helpers/isolated-catalog-home.js";
import { resolveSiteDatabasePaths } from "../../site-databases.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initSite } from "#src/server/runtime/composition/site-dir";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { createProgram } from "#src/cli/program";

const sampleTitles = [
  "Welcome to Tovu", "What Is Tovu?", "How Themes Work", "How Plugins Work", "The Plugin API",
  "Self-Hosting — Coming Soon", "Field Notes: The Weight of Type", "Slow Mornings",
].sort();

// Open through the real boot boundary: the fallback demo seed must never repopulate a blank site.
for (const kind of ["sqlite", "pglite"] as const) {
  test(`new ${kind} site keeps only the Blog listing page after init and two boots`, async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "tovu-blank-site-"));
    const dir = path.join(parent, "blank");
    try {
      await initSite({ dir, storage: { kind } });
      const paths = resolveSiteDatabasePaths({ dir });
      for (let boot = 0; boot < 2; boot += 1) {
        const store = await openSiteStore({ storage: { kind }, dbPath: paths.contentDbPath, chatDbPath: paths.chatDbPath, role: "owner" });
        try {
          const entries = await store.content.run((db) => db.selectFrom("posts").select(["id", "kind", "slug", "template_choice"]).execute());
          assert.deepEqual(entries, [{ id: "page-blog", kind: "page", slug: "blog", template_choice: "listing-default.html" }]);
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
      const paths = resolveSiteDatabasePaths({ dir });
      const store = await openSiteStore({ storage: { kind: "sqlite" }, dbPath: paths.contentDbPath, chatDbPath: paths.chatDbPath, role: "owner" });
      try {
        const entries = await store.content.run((db) => db.selectFrom("posts").select(["title", "kind"]).execute());
        assert.deepEqual(entries.filter((entry) => entry.kind === "post").map((entry) => entry.title).sort(), withSampleContent ? sampleTitles : []);
        assert.equal(entries.filter((entry) => entry.kind === "page").length, withSampleContent ? 2 : 1);
      } finally { await store.close(); }
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
}
