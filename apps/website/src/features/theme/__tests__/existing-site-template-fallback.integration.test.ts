import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, rescanThemes, resolveTemplate, applicableThemeTemplates } from "../index.js";
import { relativeFilePaths } from "../sync-originals.js";
import { bareDeps, barePost } from "#src/server/inbound/admin-http/routes/posts/__tests__/preview-fixtures";
import { renderPostPreview } from "#src/server/inbound/admin-http/routes/posts/template-preview-render";
import { buildPostPreviewRegistrations } from "../../post/preview-tool.js";
import { buildPostRegistrations } from "../../post/tool-registrations.js";
import { InMemoryPresentationSettingsRepo } from "../../presentation/index.js";
import { withContentTargets } from "../../../assistant/__tests__/fixtures/content-target-inputs.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import type { ToolExecutionContext } from "@jini-ai/core";

/** Class B: site copies and package templates need not be the same version. */
const STOCK = resolve(import.meta.dirname, "../../../../../../content/themes");
const context = (input: unknown) => ({ principal: { id: "owner" }, input, signal: new AbortController().signal }) as ToolExecutionContext;

test("an older site's assistant discovers, saves and renders the blank landing template without rewriting its themes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "tovu-old-theme-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const prefix of ["", "__original-themes__"]) {
    const dir = join(root, prefix, "static/tovu-starter");
    cpSync(join(STOCK, "static/tovu-starter"), dir, { recursive: true });
    rmSync(join(dir, "render/pages/pages-blank.html"));
    const manifest = JSON.parse(readFileSync(join(dir, "theme.json"), "utf8"));
    manifest.templates = manifest.templates.filter((name: string) => name !== "pages-blank.html");
    delete manifest.templateFor["pages-blank.html"];
    writeFileSync(join(dir, "theme.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "css/theme.css"), "/* owner's custom CSS */ body{color:purple}");
  }
  const snapshot = () => relativeFilePaths(root).map((file) => [file, readFileSync(join(root, file)).toString("base64")]);
  const before = snapshot();
  const themes = discoverAllBuiltInThemes({ dir: root, source: "built-in" });
  const theme = themes.find((item) => item.manifest.id === "tovu-starter")!;
  assert.equal(theme.status, "valid", theme.errors.join("; "));
  const { deps, repo } = bareDeps([{ ...barePost, bodyHtml: "<section>Nimbus landing content</section>" }]);
  deps.themes = themes;
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "w", activeThemeId: theme.manifest.id, updatedAt: barePost.updatedAt }] });
  const preview = withContentTargets({ deps, registrations: buildPostPreviewRegistrations(deps, { renderPostPreview }) })[0]!;
  const offered = await preview.handler(context({ id: barePost.id })) as { availableTemplates: string[] };
  assert.ok(offered.availableTemplates.includes("pages-blank.html"), "older site must offer the new blank landing template");
  for (const choice of offered.availableTemplates) {
    const resolution = resolveTemplate({ theme, templateChoice: choice });
    assert.equal(resolution.kind, "template", `offered template ${choice} must resolve`);
    if (resolution.kind === "template") assert.equal(resolution.pageId, choice.replace(/\.html$/, ""));
  }
  const tools = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });
  await tools.find((tool) => tool.descriptor.id === "content_post_update")!.handler(context({ id: barePost.id, kind: "page", template: "pages-blank.html" }));
  const saved = await repo.findById({ workspaceId: "w", id: barePost.id });
  assert.equal(saved?.templateChoice, "pages-blank.html");
  const rendered = await preview.handler(context({ id: barePost.id })) as { body: string; templateChoice: string };
  assert.equal(rendered.templateChoice, "pages-blank.html");
  assert.match(rendered.body, /Nimbus landing content/);
  assert.doesNotMatch(rendered.body, /class="site-header"|<footer/);
  assert.match(rendered.body, /theme\.css/);
  assert.match(theme.css, /owner's custom CSS/);
  rescanThemes({ themes, dir: root });
  assert.ok(applicableThemeTemplates({ manifest: themes[0]!.manifest, kind: "page" }).includes("pages-blank.html"));
  assert.deepEqual(snapshot(), before, "discovery and rendering must preserve site files and originals byte for byte");
});
