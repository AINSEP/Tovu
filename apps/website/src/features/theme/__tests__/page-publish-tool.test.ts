import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { buildRegistrations, catalog, contributeThemeSetPagePublishedTools, derivedRisk, type Deps } from "../page-publish-tool.js";
import { loadTheme } from "../theme.js";

/**
 * @file theme_set_page_published: the assistant transport over the shared page-publication service.
 * Covers the permission gate, every input-shape refusal, the expected-refusal mapping to
 * ToolInputError (service refusals and unsafe paths) and the propagation of unexpected faults.
 */

function makeThemes(t: TestContext, tier = "static"): { themesDir: string; dir: string } {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "page-publish-tool-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const dir = path.join(themesDir, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier }));
  for (const page of ["index", "404", "about"]) fs.writeFileSync(path.join(dir, "pages", `${page}.html`), "<!doctype html><html><body>Page</body></html>");
  return { themesDir, dir };
}

function handlerFor(deps: Deps): (input: unknown) => Promise<unknown> {
  const registration = buildRegistrations(deps).find(r => r.descriptor.id === "theme_set_page_published");
  assert.ok(registration, "the one registration is built");
  return input => Promise.resolve(registration.handler({ input, principal: { id: "owner" } } as ToolExecutionContext));
}

const allow: Deps["authorize"] = async () => ({ allowed: true, reason: "matched" }) as Awaited<ReturnType<Deps["authorize"]>>;

test("publishes then unpublishes a standalone page and reports the resulting allowlist", async t => {
  const { themesDir, dir } = makeThemes(t);
  const deps: Deps = { workspaceId: "ws", authorize: allow, themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] };
  const run = handlerFor(deps);
  assert.deepEqual(await run({ themeId: "plain", page: "about", published: true }), { page: "about", published: true, publishedPages: ["about"] });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8")).publishedPages, ["about"]);
  assert.deepEqual(await run({ themeId: "plain", page: "about", published: false }), { page: "about", published: false, publishedPages: [] });
});

test("refuses each malformed input field with a ToolInputError naming the field", async t => {
  const { themesDir, dir } = makeThemes(t);
  const run = handlerFor({ workspaceId: "ws", authorize: allow, themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] });
  await assert.rejects(run({ themeId: 7, page: "about", published: true }), { name: "ToolInputError", message: "themeId must be a non-empty string." });
  await assert.rejects(run({ themeId: "  ", page: "about", published: true }), { message: "themeId must be a non-empty string." });
  await assert.rejects(run({ themeId: "plain", page: 1, published: true }), { message: "page must be a non-empty string." });
  await assert.rejects(run({ themeId: "plain", page: " ", published: true }), { message: "page must be a non-empty string." });
  await assert.rejects(run({ themeId: "plain", page: "about", published: "yes" }), { message: "published must be a boolean." });
});

test("maps service refusals (missing theme, wrong tier, ineligible page) to ToolInputError", async t => {
  const { themesDir, dir } = makeThemes(t, "static");
  const run = handlerFor({ workspaceId: "ws", authorize: allow, themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] });
  await assert.rejects(run({ themeId: "missing", page: "about", published: true }), (error: unknown) =>
    error instanceof ToolInputError && /theme 'missing' was not found/.test(error.message));
  await assert.rejects(run({ themeId: "plain", page: "index", published: true }), (error: unknown) =>
    error instanceof ToolInputError && /'index' is not one of this theme's own standalone pages/.test(error.message));
});

test("maps an unsafe theme path (theme dir outside the themes root) to ToolInputError", async t => {
  const { dir } = makeThemes(t);
  const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "page-publish-tool-root-"));
  t.after(() => fs.rmSync(otherRoot, { recursive: true, force: true }));
  const run = handlerFor({ workspaceId: "ws", authorize: allow, themesDir: otherRoot, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] });
  await assert.rejects(run({ themeId: "plain", page: "about", published: true }), (error: unknown) =>
    error instanceof ToolInputError && !(error.message.includes("not one of")));
});

test("propagates an unexpected fault (theme.json no longer parses) unchanged", async t => {
  const { themesDir, dir } = makeThemes(t);
  const run = handlerFor({ workspaceId: "ws", authorize: allow, themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] });
  fs.writeFileSync(path.join(dir, "theme.json"), "{not json");
  await assert.rejects(run({ themeId: "plain", page: "about", published: true }), (error: unknown) =>
    error instanceof SyntaxError && !(error instanceof ToolInputError));
});

test("denies a principal without theme.set before reading any input", async t => {
  const { themesDir, dir } = makeThemes(t);
  const deny: Deps["authorize"] = async () => ({ allowed: false, reason: "denied" }) as Awaited<ReturnType<Deps["authorize"]>>;
  const run = handlerFor({ workspaceId: "ws", authorize: deny, themesDir, themes: [loadTheme({ themeDir: dir, id: "plain", source: "site" })] });
  await assert.rejects(run({}), { message: "principal 'owner' is not authorized for 'theme.set' (denied)" });
});

test("the contributor names its own domain, builder and risk map", () => {
  const contributor = contributeThemeSetPagePublishedTools();
  assert.equal(contributor.domain, "theme-set-page-published");
  assert.equal(contributor.build, buildRegistrations);
  assert.equal(contributor.risk, derivedRisk);
  assert.equal(derivedRisk.get("theme_set_page_published"), "mutates-durable-state");
  assert.deepEqual(catalog.map(entry => entry.name), ["theme_set_page_published"]);
});
