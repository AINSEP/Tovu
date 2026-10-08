/**
 * @file AW-7 Tier 1 end to end, through the hermetic composition root (`app.ts`): the shipped
 * `samples/testimonials-faq` package installs from its folder with no code, turning it on creates
 * its two content types, and a page's collection markers render the FAQ as an accordion with
 * FAQPage JSON-LD and the testimonials as a carousel.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { EntryRecord } from "#src/features/entries/index";
import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

import { setPluginEnabled } from "@jini-ai/plugins/host";

const SAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/testimonials-faq");
const NOW = "2026-10-04T00:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };

const FAQ_MARKER = `<div data-embed-config='{"type":"collection","typeKey":"faq","layout":"accordion","structuredData":"faq-page","fields":["answer"],"sort":"order"}'>No FAQ yet</div>`;
const TESTIMONIAL_MARKER = `<div data-embed-config='{"type":"collection","typeKey":"testimonial","layout":"carousel","fields":["quote","role"],"sort":"order"}'>No testimonials yet</div>`;

function theme(): DiscoveredTheme {
  return {
    manifest: { id: "aw7-theme", name: "AW-7 Theme", version: "1.0.0", tier: "static", engine: 1, templates: ["post-template.html"] },
    dir: "/nonexistent/aw7-theme",
    tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "post-template": `<html><body><main><div data-embed-config='{"type":"content"}'></div></main></body></html>`,
    },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
}

function entry(workspaceId: string, type: string, id: string, title: string, site: Record<string, string | number>): EntryRecord {
  return { id, workspaceId, type, status: "published", title, slug: id, bodyJson: null, fieldsJson: { ext: { site } }, publishedAt: NOW, createdAt: NOW, updatedAt: NOW, version: 1 };
}

test("the Testimonials + FAQ sample: install (no code) -> turn on -> FAQ accordion with FAQPage JSON-LD and a testimonials carousel", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "aw7-sample-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const post: PostRecord = {
    id: "help", workspaceId: createRouteDeps().workspaceId, title: "Help", slug: "help", bodyJson: { type: "doc", content: [] },
    bodyFormat: "html", bodyHtml: `${FAQ_MARKER}${TESTIMONIAL_MARKER}`, status: "published", kind: "post", templateChoice: null, updatedAt: NOW, version: 1,
  } as PostRecord;
  const deps = { ...createRouteDeps({ installDir: path.join(root, "plugins") }), themes: [theme()], postRepo: new InMemoryPostRepo([post]) };
  const { workspaceId } = deps;

  // Install: the preview is honest about having no code, then the package lands as-is.
  const installer = deps.pluginInstaller;
  assert.ok(installer);
  const preview = await installer.preview({ sourceDir: SAMPLE_DIR });
  assert.deepEqual({ tier: preview.tier, hasCode: preview.hasCode, contentTypes: preview.contentTypes }, { tier: "tier-1", hasCode: false, contentTypes: ["testimonial", "faq"] });
  await installer.install({ sourceDir: SAMPLE_DIR, expectedDigest: preview.digest });

  // Turn on: the same domain call the admin route and the agent tool make.
  await setPluginEnabled({
    deps: { clock, repo: deps.pluginActivationRepo, discovery: await deps.discoverPlugins(), onEnabled: deps.onPluginEnabled, onDisabled: deps.onPluginDisabled },
    input: { workspaceId, pluginId: "testimonials-faq", enabled: true },
  });
  const faqType = await deps.contentTypeRepo.findByKey({ workspaceId, key: "faq" });
  assert.deepEqual(faqType?.fields.map((field) => `${field.name}:${field.kind}`), ["answer:text", "category:text", "order:integer"]);
  assert.notEqual(await deps.contentTypeRepo.findByKey({ workspaceId, key: "testimonial" }), null);

  // The owner adds entries (seeded straight into the composition's own entry store).
  await deps.entryRepo.save(entry(workspaceId, "faq", "faq-2", "Do you ship abroad?", { answer: "Yes, worldwide.", order: 2 }));
  await deps.entryRepo.save(entry(workspaceId, "faq", "faq-1", "Can I return it?", { answer: "Within 30 days.", order: 1 }));
  await deps.entryRepo.save(entry(workspaceId, "testimonial", "t-1", "Ada", { quote: "Changed how we work.", role: "CTO", rating: 5, order: 1 }));

  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/help`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.match(html, /<div class="entry-list entry-list--faq entry-list--accordion" data-tovu-entry-list><details class="entry-accordion__item"><summary class="entry-accordion__question">Can I return it\?<\/summary>/, "sorted by the declared order field");
  const jsonLd = /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage".*?)<\/script>/.exec(html)?.[1];
  assert.ok(jsonLd, "FAQPage JSON-LD is emitted");
  assert.deepEqual(JSON.parse(jsonLd).mainEntity, [
    { "@type": "Question", name: "Can I return it?", acceptedAnswer: { "@type": "Answer", text: "Within 30 days." } },
    { "@type": "Question", name: "Do you ship abroad?", acceptedAnswer: { "@type": "Answer", text: "Yes, worldwide." } },
  ]);
  assert.match(html, /class="entry-list entry-list--testimonial entry-list--carousel" data-tovu-entry-list tabindex="0">/);
  assert.match(html, /Changed how we work\./);
  assert.doesNotMatch(html, /No FAQ yet|No testimonials yet/, "both markers resolved");
});
