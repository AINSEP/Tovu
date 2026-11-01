import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadTheme } from "../theme.js";
import { resolveTemplate } from "../static-render.js";
import { applicableThemeTemplates } from "../template-applicability.js";

/** Class B guard: new package templates and site copies need not share a version. */
const content = `<html><body><main data-embed-config='{"type":"content"}'></main></body></html>`;

test("fallback applies to future missing templates while site files, applicability and defaults retain precedence", (t) => {
  const root = mkdtempSync(join(tmpdir(), "tovu-template-class-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const site = join(root, "site/static/future");
  const original = join(root, "package/__original-themes__/static/future");
  for (const dir of [site, original]) {
    mkdirSync(join(dir, "render/pages"), { recursive: true });
    writeFileSync(join(dir, "tokens.json"), "{}");
    writeFileSync(join(dir, "render/pages/index.html"), content);
    writeFileSync(join(dir, "render/pages/local.html"), content + "local edits");
    writeFileSync(join(dir, "theme.json"), JSON.stringify({ id: "future", tier: "static", apiVersion: 2, templates: ["local.html"], templateFor: { "local.html": ["post"] } }));
  }
  writeFileSync(join(original, "render/pages/local.html"), content + "stock version");
  writeFileSync(join(original, "render/pages/new-layout.html"), content + "new layout");
  writeFileSync(join(original, "theme.json"), JSON.stringify({ id: "future", tier: "static", apiVersion: 2, templates: ["local.html", "new-layout.html"], templateFor: { "local.html": ["page"], "new-layout.html": ["page"] } }));
  const theme = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.equal(theme.status, "valid", theme.errors.join("; "));
  assert.deepEqual(theme.manifest.templates, ["local.html", "new-layout.html"]);
  assert.deepEqual(applicableThemeTemplates({ manifest: theme.manifest, kind: "page" }), ["new-layout.html"]);
  assert.match(theme.pages.local!, /local edits/);
  const defaultTemplate = resolveTemplate({ theme, templateChoice: null });
  assert.equal(defaultTemplate.kind, "template");
  if (defaultTemplate.kind === "template") assert.equal(defaultTemplate.pageId, "local");
  const inherited = resolveTemplate({ theme, templateChoice: "new-layout.html" });
  assert.equal(inherited.kind, "template");
  if (inherited.kind === "template") assert.equal(inherited.pageId, "new-layout");
  assert.equal(existsSync(join(site, "render/pages/new-layout.html")), false);

  // A site's own new template wins immediately, including its decision not to offer a local file.
  writeFileSync(join(site, "render/pages/new-layout.html"), content + "owner's new layout");
  const localOnly = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.deepEqual(localOnly.manifest.templates, ["local.html"]);
  assert.match(localOnly.pages["new-layout"]!, /owner's new layout/);
  const localManifest = JSON.parse(readFileSync(join(site, "theme.json"), "utf8"));
  localManifest.templates.push("new-layout.html");
  localManifest.templateFor["new-layout.html"] = ["post"];
  writeFileSync(join(site, "theme.json"), JSON.stringify(localManifest));
  const localChoice = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.deepEqual(applicableThemeTemplates({ manifest: localChoice.manifest, kind: "page" }), []);
  assert.match(localChoice.pages["new-layout"]!, /owner's new layout/);
  // If only the file is missing, its site's declared applicability still takes precedence.
  rmSync(join(site, "render/pages/new-layout.html"));
  const missingLocalChoice = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.equal(missingLocalChoice.status, "valid", missingLocalChoice.errors.join("; "));
  assert.deepEqual(applicableThemeTemplates({ manifest: missingLocalChoice.manifest, kind: "page" }), []);
  assert.match(missingLocalChoice.pages["new-layout"]!, /new layout/);

  // A missing/disabled/invalid/different-layout package must never advertise an unresolvable choice.
  for (const packageThemesDir of [null, join(root, "absent")]) {
    const unavailable = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir });
    assert.equal(unavailable.status, "invalid", "the missing declared source remains a validation error");
    assert.equal(unavailable.pages["new-layout"], undefined);
  }
  const stockManifest = JSON.parse(readFileSync(join(original, "theme.json"), "utf8"));
  delete stockManifest.apiVersion;
  writeFileSync(join(original, "theme.json"), JSON.stringify(stockManifest));
  mkdirSync(join(original, "pages"));
  for (const name of ["index", "local", "new-layout"]) writeFileSync(join(original, `pages/${name}.html`), content);
  const mismatched = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.equal(mismatched.status, "invalid");
  assert.equal(mismatched.pages["new-layout"], undefined);
  stockManifest.apiVersion = 2;
  writeFileSync(join(original, "theme.json"), JSON.stringify(stockManifest));
  writeFileSync(join(original, "render/pages/new-layout.html"), "<html>No content marker</html>");
  const invalidStock = loadTheme({ themeDir: site, id: "future", source: "site" }, { packageThemesDir: join(root, "package") });
  assert.equal(invalidStock.status, "invalid");
  assert.equal(invalidStock.pages["new-layout"], undefined);
});
