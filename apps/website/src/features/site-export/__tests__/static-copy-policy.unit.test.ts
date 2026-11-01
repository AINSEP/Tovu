import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { uploadMedia } from "@jini-ai/cms/media";
import { saveLibraryDocument } from "../../media/library-save-attachment.js";
import { buildStaticSiteZip } from "../../site-backup/share-zip.js";
import { createShareArchiveReader } from "../../site-backup/import-archive-reader.js";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { exportSite } from "../site-exporter.js";
import { captureStaticSite } from "../../site-backup/static-copy.js";
import { publishStaticSite } from "../../deployments/static-publish/adapter.js";
import type { DeployFile } from "@jini-ai/devops/deploy";
import type { LoadedDeployTarget } from "../../deployments/deploy-targets/types.js";
import { exportPublicOrigin, rewriteRenderOrigins } from "../public-origin-policy.js";
import { downloadForms, exportHtml } from "../export-html-policy.js";

const PUBLIC = "https://public.example.test";
const MEDIA = "/m/cover/public.v1/image.webp";
const CSS = "/theme-assets/policy/style.css";
const FORM = '<form class="widget tovu-form widget-contact-form" toolname="form_contact" tooldescription="contact" method="post" action="/forms/contact/submit" data-form-slug="contact" data-contact-form-slug="contact"><button>Send</button></form>';

function page({ origin }: { origin: string }, _options = {}) {
  return `<!doctype html><html><head><link rel="canonical" href="${origin}/about"><meta property="og:url" content="${origin}/about"><meta property="og:image" content="${origin}${MEDIA}"><meta name="twitter:image" content="${origin}${MEDIA}"><script type="application/ld+json">{"url":"${origin}/about","@id":"${origin}/#site","nested":{"url":"http://127.0.0.2:8000/about"}}</script><link rel="stylesheet" href="${CSS}"></head><body><a href="/about">About</a><img src="${MEDIA}">${FORM}<a href="mailto:hello@example.test">Email</a><script data-tovu-webmcp-script>window.tool="internal"</script><input toolparamtitle="Name" toolparamdescription="Your name" toolautosubmit></body></html>`;
}

async function fixture({ t, configured = true }: { t: TestContext; configured?: boolean }, _options = {}) {
  const outputDir = await mkdtemp(path.join(tmpdir(), "export-policy-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const deps = createRouteDeps();
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "https", host: configured ? "public.example.test" : "localhost", ...(configured ? {} : { port: 3000 }), source: configured ? "workspace-setting" : "dev-capability", verifiedAt: "2026-10-30T00:00:00Z" });
  deps.createSiteApp = () => {
    const app = express();
    app.use((req, res) => {
      const route = req.url ?? "/";
      if (route === CSS) { res.setHeader("content-type", "text/css"); res.end('body{background:url("http://127.0.0.1:3000/m/cover/public.v1/image.webp")}'); return; }
      if (route === MEDIA) { res.setHeader("content-type", "image/webp"); res.end("image bytes"); return; }
      if (route === "/robots.txt") { res.setHeader("content-type", "text/plain"); res.end("User-agent: *\nSitemap: https://localhost:3000/sitemap.xml\n"); return; }
      if (route === "/llms.txt") { res.setHeader("content-type", "text/plain"); res.end("[About](https://localhost:3000/about)\n"); return; }
      if (route.endsWith(".xml")) {
        res.setHeader("content-type", "application/xml");
        res.end(route === "/feed.xml" ? '<rss version="2.0"><channel><title>Zoran</title><description>News</description><link>https://localhost:3000/about</link></channel></rss>' : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://localhost:3000/about</loc></url></urlset>'); return;
      }
      res.statusCode = route.includes("tovu-export-404-check") ? 404 : 200;
      res.setHeader("content-type", "text/html");
      // Include the actual ephemeral render origin as well as the persisted localhost origin.
      res.end(page({ origin: "https://localhost:3000" }).replace("</body>", `<a href="http://${req.headers.host}/about">Render link</a></body>`));
    });
    return app;
  };
  return { deps, outputDir };
}

async function assertNoRenderOrigins({ outputDir }: { outputDir: string }, _options = {}) {
  for (const file of await readdir(outputDir, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const bytes = await readFile(path.join(file.parentPath, file.name));
    assert.doesNotMatch(bytes.toString(), /localhost|127\.\d+\.\d+\.\d+|data-tovu-webmcp-script|\btoolname\s*=|\btooldescription\s*=/i, file.name);
  }
}

test("configured public origin replaces every render origin; exporter layout and root links stay pinned", async t => {
  const { deps, outputDir } = await fixture({ t });
  const report = await exportSite({ routeDeps: deps, outputDir, includeThemePreviews: false, publicUrl: "https://public.example.test" });
  assert.deepEqual(report.routes.failed, []);
  assert.deepEqual(report.assets.failed, []);
  await assertNoRenderOrigins({ outputDir });
  const html = await readFile(path.join(outputDir, "about/index.html"), "utf8");
  assert.match(html, /rel="canonical" href="https:\/\/public\.example\.test\/about"/);
  assert.match(html, /"@id":"https:\/\/public\.example\.test\/#site"/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /src="\/m\/cover\/public\.v1\/image\.webp"/);
  assert.match(html, /href="\/theme-assets\/policy\/style\.css"/);
  assert.match(html, /action="\/forms\/contact\/submit"/);
  assert.match(html, /data-form-slug="contact"/);
  assert.doesNotMatch(html, /toolparamtitle|toolparamdescription|toolautosubmit/);
  assert.equal((await readFile(path.join(outputDir, MEDIA.slice(1)))).toString(), "image bytes");
  assert.match(await readFile(path.join(outputDir, "sitemap.xml"), "utf8"), /https:\/\/public\.example\.test\/about/);
  assert.match(await readFile(path.join(outputDir, "feed.xml"), "utf8"), /https:\/\/public\.example\.test\/about/);
  assert.match(await readFile(path.join(outputDir, "robots.txt"), "utf8"), /Sitemap: https:\/\/public\.example\.test\/sitemap.xml/);
  assert.match(await readFile(path.join(outputDir, "llms.txt"), "utf8"), /https:\/\/public\.example\.test\/about/);
  assert.deepEqual(report.droppedReferences, [], "retained form actions are not reported as dropped");
});

test("no public origin omits sitemap and feed, removes identity metadata, and keeps root-relative llms and images", async t => {
  const { deps, outputDir } = await fixture({ t, configured: false });
  await writeFile(path.join(outputDir, "sitemap.xml"), "https://localhost:3000/about");
  await writeFile(path.join(outputDir, "feed.xml"), "https://localhost:3000/about");
  await exportSite({ routeDeps: deps, outputDir, includeThemePreviews: false });
  await assertNoRenderOrigins({ outputDir });
  const html = await readFile(path.join(outputDir, "about/index.html"), "utf8");
  assert.doesNotMatch(html, /rel="canonical"|property="og:url"|"(?:url|@id)"\s*:/);
  assert.match(html, /property="og:image" content="\/m\/cover\/public.v1\/image.webp"/);
  await assert.rejects(readFile(path.join(outputDir, "sitemap.xml")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(outputDir, "feed.xml")), { code: "ENOENT" });
  assert.doesNotMatch(await readFile(path.join(outputDir, "robots.txt"), "utf8"), /Sitemap:/);
  assert.match(await readFile(path.join(outputDir, "llms.txt"), "utf8"), /\[About\]\(\/about\)/);
});

test("download removes server form actions, reports only actual removals, and writes a plain dated README", async t => {
  const { deps } = await fixture({ t, configured: false });
  const copy = await captureStaticSite({ render: input => exportSite({ ...input, routeDeps: deps, includeThemePreviews: false }),
    context: async () => ({ name: "Zoran", slug: "zoran-new", theme: "Zoran Poster", timeZone: "America/Los_Angeles" }), now: () => new Date("2026-10-30T18:07:14Z") });
  assert.ok(!("reason" in copy));
  assert.equal(copy.filename, "zoran-static-2026-10-30-1107.zip");
  const html = copy.files.find(file => file.path === "about/index.html")!.content.toString();
  assert.doesNotMatch(html, /\baction=|method="post"/);
  assert.match(html, /<\/form><p>This form needs a server to send messages\. Email us at <a href="mailto:hello@example.test">hello@example.test<\/a> instead\.<\/p>/);
  assert.ok(copy.metadata.skipped.references.some(ref => ref.page === "/about" && ref.url === "/forms/contact/submit" && ref.reason === "needs-server"));
  const readme = copy.files.find(file => file.path === "README.txt")!.content.toString();
  assert.match(readme, /^Zoran — static copy\nExported: Friday, October 30, 2026 at 11:07 AM PDT \(2026-10-30T11:07:14-07:00\)\nTheme: Zoran Poster\n/);
  assert.match(readme, /Contains: \d+ pages and posts, 1 image, 0 videos\./);
  assert.match(readme, /Contact form on \/about/);
  assert.match(readme, /No public domain is set, so sitemap.xml was left out\./);
  assert.match(readme, /feed.xml was left out/);
  assert.doesNotMatch(readme, /\{|\}|Unreferenced|Dropped references|Rendered routes/);
  assert.ok(!copy.files.some(file => file.path === "EXPORTED.txt"));
});

test("static publish pins about/index.html, media and theme paths, root links and working form actions", async t => {
  const { deps, outputDir } = await fixture({ t });
  let files: readonly DeployFile[] = [];
  const target: LoadedDeployTarget = { descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [] }, pluginId: "fixture", module: { create: () => ({ id: "fixture", publish: async (input: { files: readonly DeployFile[] }) => { files = input.files; return { targetId: "fixture", url: PUBLIC, status: "ready" }; }, checkReachability: async () => ({ reachable: true }) }) } };
  let receiverPrepared = false;
  const outcome = await publishStaticSite({ credentialSource: { resolve: async () => ({ ok: true, token: "fixture" }), isConfigured: async () => ({ configured: true }) },
    formDestination: { previewInput: async () => ({}), prepare: async () => { receiverPrepared = true; return { hosting: { forms: [{ slug: "contact", fields: [] }] } }; } },
    loadDeployTargets: async () => ({ refusals: [], get: () => target, list: () => [target] }),
  }, { workspaceId: deps.workspaceId, publishOutputRootDir: outputDir, idGen: deps.idGen,
    exportSiteBound: input => exportSite({ ...input, routeDeps: deps, includeThemePreviews: false }), config: { target: "fixture" }, projectName: "Zoran" });
  assert.equal(outcome.ok, true);
  assert.equal(receiverPrepared, true);
  assert.ok(files.some(file => file.file === "about/index.html"));
  assert.ok(files.some(file => file.file === MEDIA.slice(1)));
  assert.ok(files.some(file => file.file === CSS.slice(1)));
  const html = String(files.find(file => file.file === "about/index.html")!.data);
  assert.match(html, /href="\/about"/);
  assert.match(html, /action="\/forms\/contact\/submit"/);
  assert.doesNotMatch(html, /This form needs a server|data-tovu-webmcp-script|toolname=/);
});

test("origin replacement handles remote render authorities, loopback aliases, JSON escaping and origin-only links", () => {
  const origins = ["https://render.example.test", "http://LOCALHOST.:3000", "http://127.0.0.9:80", "http://127.1", "http://[::1]:3000", "http://[::ffff:127.0.0.1]", "//localhost:8000"];
  for (const origin of origins) {
    assert.equal(rewriteRenderOrigins({ body: `${origin}/about?q=1#top`, renderOrigin: "https://render.example.test", publicOrigin: PUBLIC }), `${PUBLIC}/about?q=1#top`);
    assert.equal(rewriteRenderOrigins({ body: `[Home](${origin})`, renderOrigin: "https://render.example.test" }), "[Home](/)");
  }
  const escaped = JSON.stringify({ url: "http://localhost:3000/about" }).replaceAll("/", "\\/");
  assert.deepEqual(JSON.parse(rewriteRenderOrigins({ body: escaped, renderOrigin: "https://render.example.test", publicOrigin: PUBLIC })), { url: `${PUBLIC}/about` });
  const external = 'https://cdn.example.test/m/photo.webp /about /m/cover/public.v1/image.webp /theme-assets/policy/style.css';
  assert.equal(rewriteRenderOrigins({ body: external, renderOrigin: "https://render.example.test", publicOrigin: PUBLIC }), external);
});

test("registry absence, dev evidence and configured loopback never provide export identity", async () => {
  const registry = { canonicalOrigin: async () => { throw new Error("No public origin"); }, isAllowedRedirectTarget: async () => false, isAllowedEgressTarget: async () => false };
  assert.equal(await exportPublicOrigin({ registry, workspaceId: "site" }), undefined);
  for (const host of ["localhost", "127.0.0.1", "[::1]", "[::ffff:127.0.0.1]"]) {
    const configured = { ...registry, canonicalOrigin: async () => ({ scheme: "https" as const, host, source: "workspace-setting" as const, verifiedAt: "2026-10-30T00:00:00Z" }) };
    assert.equal(await exportPublicOrigin({ registry: configured, workspaceId: "site" }), undefined);
  }
});

test("download form edits preserve external and mailto actions, theme attributes and unrelated script bytes", () => {
  const html = `<div>${FORM}<form action="https://receiver.example.test/forms/send" method="post"></form><form action="mailto:help@example.test" method="post"></form><script>const path = "/about";</script></div>`;
  const result = downloadForms({ html, page: "/contact", publicOrigin: PUBLIC });
  assert.deepEqual(result.removed, [{ page: "/contact", url: "/forms/contact/submit", attribute: "action", reason: "needs-server" }]);
  assert.match(result.html, /<\/form><p>This form needs a server to send messages\.<\/p>/);
  assert.match(result.html, /action="https:\/\/receiver.example.test\/forms\/send" method="post"/);
  assert.match(result.html, /action="mailto:help@example.test" method="post"/);
  assert.match(result.html, /data-contact-form-slug="contact"/);
  assert.match(result.html, /<script>const path = "\/about";<\/script>/);
  assert.deepEqual(downloadForms({ html: result.html, page: "/contact", publicOrigin: PUBLIC }).removed, []);
});

test("fallback metadata removes nested JSON-LD identity and invalid blocks without serializing theme HTML", () => {
  const html = '<html><head><meta name="og:url" content="/about"><meta property="og:image" content="https://external.example/image.webp"><script type="application/ld+json">[{"@id":"/site","nested":{"url":"/about","name":"Keep"}}]</script><script type="application/ld+json">invalid</script></head><body><a  href="/about">About</a></body></html>';
  const actual = exportHtml({ html });
  assert.doesNotMatch(actual, /og:url|og:image|@id|"url"|invalid/);
  assert.match(actual, /\[{"nested":{"name":"Keep"}}\]/);
  assert.match(actual, /<a  href="\/about">About<\/a>/);
});

test("static download excludes a saved private Library document and removes every HTML and CSS reference to it", async t => {
  const { deps } = await fixture({ t, configured: false });
  const privateBytes = Buffer.from("Assistant-only Library notes: keep this document private.");
  const saved = await saveLibraryDocument({ deps, bytes: privateBytes, name: "internal-library-notes.md", principalId: "owner" });
  assert.equal(saved.document.publicUrl, null);
  const document = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: saved.document.id });
  assert.equal(document?.kind, "document");
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: document!.source.sha256 });
  assert.equal(blob?.documentOwned, true, "fixture must use assistant-only Library ingestion, not public media");
  const { media: publicImage } = await uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>'),
      filename: "public-mark.svg", contentType: "image/svg+xml", createdByPrincipal: "owner" },
  });
  const privateSlugUrl = `/m/${document!.slug}/original`;
  const privateIdUrl = `/m/${document!.id}/original`;
  const app = express();
  app.get("/", (_req, res) => res.type("html").send(`<!doctype html><html><head>
    <link rel="stylesheet" href="/theme-assets/library-test/css/theme.css">
    <style>.private{background:url('${privateSlugUrl}')}</style></head><body>
    <a href="${privateSlugUrl}">Library document</a><img src="${privateIdUrl}" srcset="${privateSlugUrl} 1x, ${privateIdUrl} 2x">
    <div style="background:url('${privateIdUrl}')"></div><img src="/m/${publicImage.slug}/original">
    </body></html>`));
  app.get("/theme-assets/library-test/css/theme.css", (_req, res) => res.type("css").send(
    `.by-slug{background:url('${privateSlugUrl}')}.by-id{background:url('${privateIdUrl}')}`));
  // The real public media route must enforce the document-owned blob boundary.
  app.use(createApp(deps));
  const copy = await captureStaticSite({
    render: input => exportSite({ ...input, routeDeps: { ...deps, themes: [], createSiteApp: () => app }, includeThemePreviews: false }),
    context: async () => ({ name: "Library Test", slug: "library-test", theme: "library-test" }),
    now: () => new Date("2026-10-30T17:15:00Z"),
  });
  assert.ok(!("reason" in copy));
  const archive = await buildStaticSiteZip({ copy, zip: zipFolderFiles });
  const files = new Map<string, Buffer>();
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    files.set(entry.entryPath, Buffer.concat(chunks));
  }
  assert.ok([...files].some(([name]) => name.endsWith("/index.html")), "export must deliver pages");
  assert.ok([...files].some(([name]) => name.endsWith("/theme.css")), "export must deliver CSS");
  assert.ok([...files.values()].some(bytes => bytes.includes('<circle r="2"/>')), "referenced public media must still be delivered");
  for (const [name, bytes] of files) {
    assert.ok(!name.includes(document!.id) && !name.includes(document!.slug) && !name.includes("internal-library-notes"), name);
    assert.ok(!bytes.includes(privateBytes), `private Library bytes leaked in ${name}`);
    if (/\.(?:html|css)$/i.test(name)) {
      assert.ok(!bytes.includes(document!.id) && !bytes.includes(document!.slug), `private Library reference left in ${name}`);
    }
  }
});
