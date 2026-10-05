// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite, type SiteDialect } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap 3 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — plugins through the REAL
 * site composition on both dialects (`plugin_activations`, declared content types and entries all in
 * the site's own store), driven only through HTTP:
 *  - AW-7 Tier 1: the shipped `testimonials-faq` sample installs from its folder with no code, turning
 *    it on writes its content types, and a published Page's collection marker renders through the
 *    seeded default theme as an FAQ accordion with FAQPage JSON-LD;
 *  - AW-7 Tier 2: `POST .../plugins/content-analyzer/preview` runs the compiled-in analyzer in a real
 *    worker once enabled;
 *  - the install routes still own `.../plugins/install/preview` with that tier-2 plugin present;
 *  - a second plugin declaring the same content type is listed with the conflict at install preview
 *    and refused at enable with 409 PLUGIN_CONFLICT.
 *
 * `testimonials-faq-sample.integration.test.ts`, `preview.integration.test.ts` and
 * `plugins-http.integration.test.ts` prove these on the hermetic `createRouteDeps()` root (in-memory
 * activation and entry repos, a hand-made theme); `declared-content-types-wiring.integration.test.ts`
 * proves the deferred content-type ports on SQLite only, by direct domain call.
 *
 * Process env, read at composition time: `TOVU_PLUGINS_DIR` (never the repo's `sites/` default) and
 * `TOVU_PLUGIN_LOCAL_INSTALL=1` (the install routes refuse with 403 otherwise).
 */

const SAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../features/plugin-runtime/samples/testimonials-faq");

const FAQ_MARKER = `<div data-embed-config='{"type":"collection","typeKey":"faq","layout":"accordion","structuredData":"faq-page","fields":["answer"],"sort":"order"}'>No FAQ yet</div>`;

const ANALYZER_DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why it matters" }] },
    { type: "paragraph", content: [{ type: "text", text: "Short posts read fast. This one has two sentences." }] },
  ],
};

interface PluginRow {
  id: string;
  enabled: boolean;
  tier: string;
  conflicts: unknown[];
}

interface InstallPreview {
  id: string;
  tier: string;
  hasCode: boolean;
  contentTypes: string[];
  conflicts: unknown[];
  digest: string;
}

function setEnv(t: TestContext, name: string, value: string): void {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

/** A site with its own plugins dir and local installs on. Returns a scratch dir outside the plugins tree for sources. */
async function bootPluginSite(t: TestContext, dialect: SiteDialect): Promise<{ site: BootedSite; scratch: string }> {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `unrun-plugins-${dialect}-`));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  setEnv(t, "TOVU_PLUGINS_DIR", path.join(parent, "plugins"));
  setEnv(t, "TOVU_PLUGIN_LOCAL_INSTALL", "1");
  const site = await bootSite(t, dialect);
  await site.deps.pluginRuntimeReady;
  const scratch = path.join(parent, "sources");
  fs.mkdirSync(scratch);
  return { site, scratch };
}

const pluginsRoute = (site: BootedSite): string => `${site.ws}/plugins`;

async function listPlugins(site: BootedSite): Promise<PluginRow[]> {
  return (await expectJson<{ plugins: PluginRow[] }>(await send(site, "GET", pluginsRoute(site)), 200)).plugins;
}

async function installFolder(site: BootedSite, sourceDir: string): Promise<InstallPreview> {
  const source = { kind: "folder", path: sourceDir };
  const preview = (await expectJson<{ plugin: InstallPreview }>(await send(site, "POST", `${pluginsRoute(site)}/install/preview`, { source }), 200)).plugin;
  await expectJson(await send(site, "POST", `${pluginsRoute(site)}/install`, { source, expectedDigest: preview.digest }), 201);
  return preview;
}

async function setEnabled(site: BootedSite, pluginId: string, enabled: boolean): Promise<Response> {
  return send(site, "PATCH", `${pluginsRoute(site)}/${pluginId}`, { enabled });
}

async function createPublishedEntry(site: BootedSite, input: { slug: string; title: string; site: Record<string, string | number> }): Promise<void> {
  const created = await expectJson<{ entry: { id: string; version: number } }>(
    await send(site, "POST", "/api/admin/v1/entries", { type: "faq", slug: input.slug, title: input.title, fieldsJson: { ext: { site: input.site } } }),
    201
  );
  await expectJson(await send(site, "POST", `/api/admin/v1/entries/${created.entry.id}/lifecycle`, { op: "publish", expectedVersion: created.entry.version }), 200);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] plugins [${dialect}]: Tier-1 Testimonials + FAQ installs with no code, turning it on persists its types, and a Page renders the FAQ accordion with FAQPage JSON-LD`, async (t) => {
    const { site } = await bootPluginSite(t, dialect);
    const { workspaceId } = site.deps;

    const preview = await installFolder(site, SAMPLE_DIR);
    assert.deepEqual(
      { id: preview.id, tier: preview.tier, hasCode: preview.hasCode, contentTypes: preview.contentTypes, conflicts: preview.conflicts },
      { id: "testimonials-faq", tier: "tier-1", hasCode: false, contentTypes: ["testimonial", "faq"], conflicts: [] }
    );
    assert.equal((await listPlugins(site)).find((plugin) => plugin.id === "testimonials-faq")?.enabled, false, "installed, still off");

    const enabled = await expectJson<{ plugin: PluginRow }>(await setEnabled(site, "testimonials-faq", true), 200);
    assert.equal(enabled.plugin.enabled, true);
    assert.equal((await listPlugins(site)).find((plugin) => plugin.id === "testimonials-faq")?.enabled, true, "the activation row persisted");
    const faqType = await site.deps.contentTypeRepo.findByKey({ workspaceId, key: "faq" });
    assert.deepEqual(faqType?.fields.map((field) => `${field.name}:${field.kind}`), ["answer:text", "category:text", "order:integer"]);
    assert.notEqual(await site.deps.contentTypeRepo.findByKey({ workspaceId, key: "testimonial" }), null);

    await createPublishedEntry(site, { slug: "faq-2", title: "Do you ship abroad?", site: { answer: "Yes, worldwide.", order: 2 } });
    await createPublishedEntry(site, { slug: "faq-1", title: "Can I return it?", site: { answer: "Within 30 days.", order: 1 } });

    const page = await expectJson<{ post: { id: string } }>(await send(site, "POST", `${site.ws}/pages`, { title: "Help", slug: "help", status: "published" }), 201);
    await expectJson(await send(site, "PUT", `${site.ws}/pages/${page.post.id}/html`, { html: FAQ_MARKER }), 200);

    const res = await fetch(`${site.baseUrl}/help`);
    const html = await res.text();
    assert.equal(res.status, 200, html.slice(0, 500));
    assert.match(
      html,
      /<div class="entry-list entry-list--faq entry-list--accordion" data-tovu-entry-list><details class="entry-accordion__item"><summary class="entry-accordion__question">Can I return it\?<\/summary>/,
      "sorted by the declared order field"
    );
    const jsonLd = /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage".*?)<\/script>/.exec(html)?.[1];
    assert.ok(jsonLd, "FAQPage JSON-LD is emitted");
    assert.deepEqual(JSON.parse(jsonLd).mainEntity, [
      { "@type": "Question", name: "Can I return it?", acceptedAnswer: { "@type": "Answer", text: "Within 30 days." } },
      { "@type": "Question", name: "Do you ship abroad?", acceptedAnswer: { "@type": "Answer", text: "Yes, worldwide." } },
    ]);
    assert.doesNotMatch(html, /No FAQ yet/, "the marker resolved");
  });

  test(`[unrun] plugins [${dialect}]: Tier-2 Content Analyzer preview runs in a worker once enabled, is 409 before, and saves nothing`, async (t) => {
    const { site } = await bootPluginSite(t, dialect);
    const preview = () => send(site, "POST", `${pluginsRoute(site)}/content-analyzer/preview`, { title: "A title that is long enough to pass the check", bodyJson: ANALYZER_DOC });

    const analyzer = (await listPlugins(site)).find((plugin) => plugin.id === "content-analyzer");
    assert.deepEqual({ tier: analyzer?.tier, enabled: analyzer?.enabled }, { tier: "tier-2", enabled: false });
    assert.deepEqual(await expectJson(await preview(), 409), { error: "plugin is not enabled", code: "PLUGIN_NOT_ENABLED" });

    await expectJson(await setEnabled(site, "content-analyzer", true), 200);
    const postsBefore = await expectJson<{ posts: unknown[] }>(await send(site, "GET", `${site.ws}/posts`), 200);

    const body = await expectJson<{ pluginId: string; fields: Record<string, unknown> }>(await preview(), 200);
    assert.equal(body.pluginId, "content-analyzer");
    assert.deepEqual(Object.keys(body.fields).sort(), ["readability", "readingTimeMinutes", "report", "score", "summary", "wordCount"]);
    assert.equal(body.fields.wordCount, 9);
    assert.equal(body.fields.readingTimeMinutes, 1);
    const report = JSON.parse(String(body.fields.report)) as { toc: unknown[] };
    assert.deepEqual(report.toc, [{ level: 2, text: "Why it matters", anchor: "why-it-matters" }]);

    const postsAfter = await expectJson<{ posts: unknown[] }>(await send(site, "GET", `${site.ws}/posts`), 200);
    assert.deepEqual(postsAfter, postsBefore, "a preview writes nothing");

    const missing = await expectJson(await send(site, "POST", `${pluginsRoute(site)}/no-such-plugin/preview`, { title: "x", bodyJson: ANALYZER_DOC }), 404);
    assert.deepEqual(missing, { error: "plugin was not found", code: "PLUGIN_NOT_FOUND" });
    const invalid = await expectJson(await send(site, "POST", `${pluginsRoute(site)}/content-analyzer/preview`, { title: 7, bodyJson: ANALYZER_DOC }), 400);
    assert.deepEqual(invalid, {
      error: "title (string) and bodyJson (object) are required; postId, slug and metaDescription must be strings",
      code: "VALIDATION_ERROR",
    });
  });

  test(`[unrun] plugins [${dialect}]: with the tier-2 analyzer enabled, .../plugins/install/preview still reaches the install preview, not the plugin preview`, async (t) => {
    const { site } = await bootPluginSite(t, dialect);
    await expectJson(await setEnabled(site, "content-analyzer", true), 200);

    const res = await send(site, "POST", `${pluginsRoute(site)}/install/preview`, { source: { kind: "folder", path: SAMPLE_DIR } });
    const body = await expectJson<{ plugin: InstallPreview & { name: string; version: string } }>(res, 200);
    assert.deepEqual(
      { id: body.plugin.id, name: body.plugin.name, version: body.plugin.version, tier: body.plugin.tier, hasCode: body.plugin.hasCode },
      { id: "testimonials-faq", name: "Testimonials + FAQ", version: "1.0.0", tier: "tier-1", hasCode: false },
      "an install-preview body, which the plugin preview route can never produce"
    );
    assert.match(body.plugin.digest, /^sha256-[a-f0-9]{64}$/);
    assert.equal((await listPlugins(site)).some((plugin) => plugin.id === "testimonials-faq"), false, "a preview installs nothing");
  });

  test(`[unrun] plugins [${dialect}]: a second plugin declaring the enabled plugin's content type is listed with the conflict at install preview and refused at enable with 409 PLUGIN_CONFLICT`, async (t) => {
    const { site, scratch } = await bootPluginSite(t, dialect);
    await installFolder(site, SAMPLE_DIR);
    await expectJson(await setEnabled(site, "testimonials-faq", true), 200);

    const rivalDir = path.join(scratch, "faq-rival");
    fs.mkdirSync(rivalDir);
    fs.writeFileSync(
      path.join(rivalDir, "tovu.plugin.json"),
      JSON.stringify({
        id: "faq-rival",
        name: "Rival FAQ",
        version: "1.0.0",
        sdkRange: "^0.1.0",
        engine: 1,
        tier: "tier-1",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: {},
        contentTypes: [{ key: "faq", label: "Rival FAQ", fields: [{ name: "answer", kind: "text", required: true }] }],
      })
    );
    const expectedConflict = { kind: "content-type", key: "faq", heldBy: "testimonials-faq", heldByName: "Testimonials + FAQ", heldKey: "faq" };

    const preview = await installFolder(site, rivalDir);
    assert.deepEqual(preview.conflicts, [expectedConflict], "install preview names the clash before anything is turned on");
    assert.deepEqual((await listPlugins(site)).find((plugin) => plugin.id === "faq-rival")?.conflicts, [expectedConflict], "the list row carries the would-be clash");

    const refused = await expectJson(await setEnabled(site, "faq-rival", true), 409);
    assert.deepEqual(refused, {
      error:
        "Plugin 'faq-rival' was not turned on because it claims things already in use: content-type 'faq' is provided by plugin 'testimonials-faq' (Testimonials + FAQ). Turn off the other plugin first, or keep 'faq-rival' off.",
      code: "PLUGIN_CONFLICT",
      details: { pluginId: "faq-rival", conflicts: [expectedConflict] },
    });

    const rows = await listPlugins(site);
    assert.deepEqual(
      rows.filter((plugin) => plugin.id === "faq-rival" || plugin.id === "testimonials-faq").map((plugin) => [plugin.id, plugin.enabled]).sort(),
      [["faq-rival", false], ["testimonials-faq", true]],
      "the refused enable left nothing half-on and the holder untouched"
    );
    const faqType = await site.deps.contentTypeRepo.findByKey({ workspaceId: site.deps.workspaceId, key: "faq" });
    assert.deepEqual(faqType?.fields.map((field) => field.name), ["answer", "category", "order"], "the holder's type was not overwritten");
  });
}
