import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { buildThemesRegistrations, type ThemeToolDeps } from "../tool-registrations.js";
import { loadTheme } from "../theme.js";

test("theme publication card lists only candidates, reads fresh disk state and defaults unpublished", async t => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "gapa-publication-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "plain");
  fs.mkdirSync(dir);
  const manifest = { id: "plain", name: "Plain", version: "1.0.0", tier: "static", templates: ["shell.html"] };
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest));
  fs.mkdirSync(path.join(dir, "pages"));
  for (const page of ["index", "404", "about", "pricing", "shell"]) fs.writeFileSync(path.join(dir, "pages", `${page}.html`), "<!doctype html><html><body>Page</body></html>");
  const deps = { workspaceId: "ws", themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })],
    authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as ThemeToolDeps;
  const card = () => deriveContentReadRegistrations(buildThemesRegistrations(deps)).find(r => r.descriptor.id === "content_read.theme_page_publication")!;
  assert.ok(card());
  assert.deepEqual((card().descriptor.inputSchema as { required: string[] }).required, ["themeId"], "themeId is required for both list and read-one; page is optional");
  const ctx = (input: unknown) => ({ input, principal: { id: "owner" } } as ToolExecutionContext);
  assert.deepEqual(await card().handler(ctx({ themeId: "plain" })), { pages: [
    { themeId: "plain", page: "about", published: false }, { themeId: "plain", page: "pricing", published: false },
  ] });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ ...manifest, publishedPages: ["about"] }));
  assert.deepEqual(await card().handler(ctx({ themeId: "plain", page: "about" })), { pages: [{ themeId: "plain", page: "about", published: true }] });
  // why: N2 (27264f16) made `id` the canonical card selector (legacy `page` is an alias), so the hint names `id`.
  await assert.rejects(card().handler(ctx({ themeId: "plain", page: "shell" })), { message: "theme_page_publication 'shell' was not found — call content_read.theme_page_publication without id to list valid ids" });
  await assert.rejects(card().handler(ctx({ themeId: "missing" })), ToolInputError);
  deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(card().handler(ctx({ themeId: "plain" })), { message: "principal 'owner' is not authorized for 'theme.set' (denied)" });
});
