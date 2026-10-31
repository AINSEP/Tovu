import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import * as yauzl from "yauzl";
import { JSDOM } from "jsdom";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { ExportReport } from "../../site-export/site-exporter.js";
import { captureStaticSite, isStaticSitePath, prepareStaticReport } from "../static-copy.js";
import { staticDownloadLayout } from "../static-download-layout.js";
import { buildShareZip, buildStaticSiteZip } from "../share-zip.js";
import { createShareArchiveReader } from "../import-archive-reader.js";
import { verifySiteImport } from "../import-verifier.js";
import { createSiteShareBackend } from "../share-backend.js";
import { SiteShareRegistry } from "../share-registry.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { SHARE_LIMITS } from "../share-policy.js";
import { renderRedirectStub } from "@jini-ai/devops/static-export";
import { rewriteExportOriginResponse } from "../../site-export/public-origin-policy.js";

const now = () => new Date("2026-10-30T17:15:00.000Z");
const context = async () => ({ name: "My Site", slug: "my-site", theme: "Active Theme", timeZone: "America/Los_Angeles" });

test('portable layout accepts rendered files and theme context without fabricated backup metadata', () => {
  const exported = report('/unused');
  exported.routes.succeeded[0]!.data = '<form action="/forms/contact/send" method="post"><button>Send</button></form>';
  const prepared = prepareStaticReport({ report: exported });
  const files = staticDownloadLayout({ copy: { files: prepared.files, themeId: 'my-summer', siteSlug: 'my-site' } });
  assert.ok(files.some(file => file.path === 'sites/summer/index.html'));
  assert.match(files.find(file => file.path === 'Open website.html')!.content.toString(), /sites\/summer\/index.html/);
  assert.doesNotMatch(files.find(file => file.path === 'sites/summer/index.html')!.content.toString(), /action="\/forms/);
  assert.match(String(exported.routes.succeeded[0]!.data), /action="\/forms/);
});
const schema = { index: 1, tag: "test" };
function report(outputDir: string): ExportReport {
  return { outputDir, routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<main>Active theme</main>" }], failed: [] },
    assets: { succeeded: [{ url: "/theme-assets/site.css", outputFile: "theme-assets/site.css", data: Buffer.from("body{}") }, { url: "/theme-assets/site.js", outputFile: "theme-assets/site.js", data: Buffer.from("window.site=true;") }], failed: [] },
    skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
}
function plan(): SiteSharePlanContent {
  return { target: { kind: "zip" }, profile: "share", schema, site: { name: "My Site", folderName: "my-site" },
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, media: [], plugins: [],
    database: { bytes: Buffer.from("projected database"), watermarkAtCapture: 0 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }],
    skipped: [], scopeNotes: {}, totalBytes: 20, tovuVersion: "test", createdAt: now().toISOString() };
}
async function unpack(archive: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    if (entry.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    files.set(entry.entryPath, Buffer.concat(chunks));
  }
  return files;
}
async function rootFor(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "static-copy-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("static download keeps the dated README while the Tovu backup contains no rendered files", async () => {
  const copy = await captureStaticSite({ render: async ({ outputDir }) => report(outputDir), context, now });
  assert.ok(!("reason" in copy));
  const download = await unpack(await buildStaticSiteZip({ copy, zip: zipFolderFiles }));
  const stamp = downloadText({ files: download, suffix: "/README.txt" });
  assert.match(stamp, /2026-10-30T10:15:00-07:00/);
  assert.match(stamp, /10:15 AM PDT/);
  assert.match(stamp, /Friday, October 30, 2026/);
  assert.match(stamp, /Active Theme/);
  assert.match(stamp, /My Site/);
  assert.equal(copy.metadata.exportedAt, "2026-10-30T10:15:00-07:00");
  const backup = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(backup.has("content.db"));
  assert.ok(![...backup.keys()].some(name => isStaticSitePath({ path: name })));
});

test("partial static failures stay in the download README and capture diagnostics, outside the Tovu backup", async () => {
  const copy = await captureStaticSite({ context, now, render: async ({ outputDir }) => ({ ...report(outputDir),
    routes: { ...report(outputDir).routes, failed: [{ path: "/broken", kind: "page", reason: "render failed" }] },
    assets: { succeeded: [], failed: [{ url: "/missing.css", reason: "404" }] },
    skippedManifestEntries: [{ reason: "wildcard", detail: "/old/*" }], unreferencedThemeFiles: ["unused.png"],
  }) });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(!("reason" in copy));
  const download = await unpack(await buildStaticSiteZip({ copy, zip: zipFolderFiles }));
  const stamp = downloadText({ files: download, suffix: "/README.txt" });
  assert.match(stamp, /Not included: Page \/broken could not be rendered\./);
  assert.match(stamp, /Not included: File \/missing.css could not be copied\./);
  assert.doesNotMatch(stamp, /\{|\}|routes|unused.png|old\/|Unreferenced/);
  const metadata = copy.metadata;
  assert.equal(metadata.skipped.routes[0]!.detail, "/old/*");
  assert.deepEqual(metadata.skipped.assets, ["unused.png"]);
  assert.equal(metadata.failed.routes[0]!.path, "/broken");
  assert.ok(files.has("content.db"));
  assert.ok(![...files.keys()].some(name => isStaticSitePath({ path: name })));
});

test("no renderable server omits static_site and records why without blocking backup", async () => {
  const copy = await captureStaticSite({ context, now, render: async () => { throw new Error("Server unavailable"); } });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(![...files.keys()].some(name => name.startsWith("static_site/")));
  const manifest = JSON.parse(files.get("manifest.json")!.toString());
  assert.equal(manifest.staticSite, undefined);
  assert.match(manifest.staticSiteOmitted, /Server unavailable/);
});

test("unavailable render ports and a lone 404 probe omit the static copy with a reason", async () => {
  const missing = await captureStaticSite({ context: async () => { throw new Error("Must not read context"); }, now });
  assert.deepEqual(missing, { reason: "Static exporter is unavailable in this context." });
  const only404 = await captureStaticSite({ context, now, render: async ({ outputDir }) => ({ ...report(outputDir),
    routes: { succeeded: [{ path: "/not-found", kind: "not-found", outputFile: "404.html", data: "Not found" }], failed: [] },
  }) });
  assert.deepEqual(only404, { reason: "The exporter produced no HTML pages." });
});

test("an unconfigured timezone stamps the plain-words time with the server's named local zone", async () => {
  const copy = await captureStaticSite({ context: async () => ({ name: "Site", slug: "site", theme: "Active" }), now,
    render: async ({ outputDir }) => report(outputDir) });
  assert.ok(!("reason" in copy));
  const text = copy.files.find(file => file.path === "README.txt")!.content.toString();
  const localTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now());
  assert.ok(text.includes(localTime));
  assert.match(copy.metadata.exportedAt, /T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test("a thrown render retains partial files and deletes its temporary render folder", async () => {
  let folder = "";
  const copy = await captureStaticSite({ context, now, render: async ({ outputDir }) => {
    folder = outputDir;
    await writeFile(path.join(outputDir, "index.html"), "partial");
    throw new Error("Render interrupted");
  } });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(!("reason" in copy));
  assert.equal(copy.files.find(file => file.path === "index.html")?.content.toString(), "partial");
  const download = await unpack(await buildStaticSiteZip({ copy, zip: zipFolderFiles }));
  assert.match(downloadText({ files: download, suffix: "/README.txt" }), /Not included: Page \(export\) could not be rendered\./);
  await assert.rejects(readFile(path.join(folder, "index.html")), { code: "ENOENT" });
  assert.ok(![...files.keys()].some(name => isStaticSitePath({ path: name })));
});

test("static-only ZIP and top folder use the display name with a dated README and no backup content", async t => {
  const registry = new SiteShareRegistry({ directory: await rootFor(t) });
  const backend = createSiteShareBackend({ registry, site: "ws", zip: zipFolderFiles,
    prepare: async () => { throw new Error("Static export must not snapshot the database"); }, delivery: async () => { throw new Error("Static download must stay local"); },
    staticSite: { context: async () => ({ ...await context(), slug: "internal-old-slug", theme: "my-theme" }), now,
      render: async ({ outputDir }) => ({ ...report(outputDir), assets: { succeeded: [
        { url: "/theme-assets/my-theme/css/site.css", outputFile: "theme-assets/my-theme/css/site.css", data: Buffer.from("body{}") },
        { url: "/theme-assets/my-theme/scripts/site.js", outputFile: "theme-assets/my-theme/scripts/site.js", data: Buffer.from("window.site=true;") },
      ], failed: [] } }) } });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal, format: "static" }, { waitMs: 60_000 }) as { shareId: string; file: string };
  assert.equal(result.file, "my-site-static-2026-10-30-1015.zip");
  assert.equal((result as unknown as { message: string }).message, 'Extract the ZIP, then double-click “Open website.html” inside the extracted folder. No local server is needed to view the exported pages. README.txt lists features that need a server.');
  const files = await unpack(await readFile(registry.artifactPath({ shareId: result.shareId })));
  assert.deepEqual([...files.keys()].sort(), ["Open website.html", "README.txt", "sites/my-theme/css/site.css", "sites/my-theme/index.html", "sites/my-theme/js/site.js"].map(file => "my-site-static-2026-10-30-1015/" + file));
});

test("a Tovu backup omits static_site while import still ignores a genuine older backup's static_site folder", async () => {
  const without = await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { packageFiles: new Map() });
  const entries = await unpack(without);
  const legacyFiles = [
    { path: "static_site/index.html", content: Buffer.from("<main>Older backup</main>") },
    { path: "static_site/theme-assets/site.css", content: Buffer.from("body{}") },
    { path: "static_site/README.txt", content: Buffer.from("Older static copy") },
  ];
  // Build the older format independently: tomorrow's builder must never create it.
  const manifest = JSON.parse(entries.get("manifest.json")!.toString());
  for (const file of legacyFiles) {
    entries.set(file.path, file.content);
    manifest.files.push({ path: file.path, bytes: file.content.length, sha256: createHash("sha256").update(file.content).digest("hex") });
  }
  entries.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
  const picked = [...entries].map(([name, bytes]) => {
    const file = new File([new Uint8Array(bytes)], name.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: "legacy/" + name });
    return file;
  });
  const older = Buffer.from(await (await zipFolderFiles({ files: picked, maxBytes: SHARE_LIMITS.maxArchiveBytes })).arrayBuffer());
  assert.equal((await unpack(older)).get("static_site/index.html")?.toString(), "<main>Older backup</main>");
  assert.equal(isStaticSitePath({ path: "static_site" }), true);
  assert.equal(isStaticSitePath({ path: "static_site/theme-assets/site.css" }), true);
  assert.equal(isStaticSitePath({ path: "static_site-other/index.html" }), false);
  const verify = (archive: Buffer) => verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema,
    sanitize: async ({ snapshot }) => ({ bytes: snapshot, media: [] }) }, { packageFiles: new Map() });
  const restored = await verify(older);
  assert.deepEqual(restored, await verify(without));
  assert.equal(restored.database.toString(), "projected database");
  assert.equal(restored.files.get("settings.json")?.toString(), "{}");
  assert.ok(![...restored.files.keys()].some(name => isStaticSitePath({ path: name })));
  const copy = await captureStaticSite({ render: async ({ outputDir }) => report(outputDir), context, now });
  const current = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(![...current.keys()].some(name => isStaticSitePath({ path: name })));
});

test("unsafe static bytes cannot block a backup or weaken its secret scanner", async () => {
  const copy = await captureStaticSite({ context, now, render: async ({ outputDir }) => ({ ...report(outputDir),
    assets: { succeeded: [{ url: "/secret.js", outputFile: "secret.js", data: Buffer.from('const key="gh' + 'p_' + 'x'.repeat(36) + '"') }], failed: [] },
  }) });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.ok(files.has("content.db"));
  assert.ok(!files.has("static_site/index.html"));
  assert.match(JSON.parse(files.get("manifest.json")!.toString()).staticSiteOmitted, /credential-shaped/);
  if (!("reason" in copy)) await assert.rejects(buildStaticSiteZip({ copy, zip: zipFolderFiles }), { code: "SECRET_IN_CONTENT" });
});

// Owner-approved DOWNLOAD contract (2026-10-30). Keep the renderer/report seam and ZIP
// encoder real. Tovu backups omit static_site/; publish, commit and CLI keep the renderer layout.
const downloadFolder = "public-studio-static-2026-10-30-1015/";

function downloadHtml({ theme, page, documents = true }: { theme: string; page: string; documents?: boolean }, _options = {}) {
  const base = `/theme-assets/${theme}`;
  return `<!doctype html><html><head>
    <link data-ref="css" rel="stylesheet" href="${base}/css/theme.css">
    <link data-ref="font" rel="preload" as="font" href="${base}/assets/fonts/Display.woff2">
    <link data-ref="icon" rel="icon" href="${base}/icons/favicon.ico">
    <link data-ref="manifest" rel="manifest" href="${base}/manifest.webmanifest">
    <style>.banner{background:url('${base}/assets/logo.webp')}</style>
    </head><body data-download-page="${page}">
    <script data-ref="js" src="${base}/scripts/main.js"></script>
    <script data-ref="vendor" src="${base}/scripts/vendor/library.js"></script>
    <img data-ref="theme-image" src="${base}/assets/logo.webp">
    <img data-ref="media-image" src="/m/portrait/public.v1/image.webp">
    <img data-ref="srcset" srcset="/m/portrait/public.v1/image.webp 1x, /m/portrait-large/public.v1/image.webp 2x, https://cdn.example.test/photo.webp 3x">
    <div data-ref="inline-style" style="background-image:url('/m/portrait/public.v1/image.webp')"></div>
    <video data-ref="video" src="/m/intro/original.mp4" poster="/m/portrait/public.v1/image.webp"></video>
    ${documents ? '<a data-ref="document" href="/m/guide/original.pdf">Guide</a>' : ""}
    <a data-ref="home" href="/">Home</a><a data-ref="about" href="/about">About</a>
    <a data-ref="contact" href="/contact/">Contact</a>
    <a data-ref="fragment" href="/case-studies#votetolive">Case study</a>
    <a data-ref="external" href="https://outside.example.test/about#team">External</a>
    <a data-ref="mailto" href="mailto:hello@example.test">Email</a>
    <a data-ref="tel" href="tel:+15551234567">Phone</a><a data-ref="hash" href="#team">Team</a>
    </body></html>`;
}

function downloadReport({ outputDir, theme = "zoran-poster", documents = true }: {
  outputDir: string; theme?: string; documents?: boolean;
}, _options = {}): ExportReport {
  const base = `/theme-assets/${theme}`;
  const assets: [string, string][] = [
    [`${base}/css/theme.css`, `@font-face{src:url('../assets/fonts/Display.woff2')}\n.hero{background:url("${base}/assets/logo.webp")}\n.portrait{background:url(/m/portrait/public.v1/image.webp)}\n.external{background:url(https://cdn.example.test/bg.webp)}`],
    [`${base}/scripts/main.js`, 'window.site=true;'],
    [`${base}/scripts/vendor/library.js`, 'window.vendor=true;'],
    [`${base}/assets/logo.webp`, 'theme logo'],
    [`${base}/assets/fonts/Display.woff2`, 'font bytes'],
    [`${base}/icons/favicon.ico`, 'icon bytes'],
    [`${base}/manifest.webmanifest`, JSON.stringify({ name: "Public Studio", icons: [{ src: `${base}/icons/favicon.ico`, sizes: "any" }] })],
    ["/m/portrait/public.v1/image.webp", "portrait bytes"],
    ["/m/portrait-large/public.v1/image.webp", "large portrait bytes"],
    ["/m/intro/original.mp4", "video bytes"],
  ];
  if (documents) assets.push(["/m/guide/original.pdf", "pdf bytes"]);
  return { ...report(outputDir), routes: { succeeded: [
    ...["/", "/about", "/contact", "/case-studies", "/projects/featured"].map(route => ({ path: route, kind: route === "/" ? "home" : "page",
      outputFile: route === "/" ? "index.html" : `${route.slice(1)}/index.html`,
      data: downloadHtml({ theme, page: route, documents }) })),
    { path: "/not-found", kind: "not-found", outputFile: "404.html", data: downloadHtml({ theme, page: "/not-found", documents }) },
    { path: "/robots.txt", kind: "well-known", outputFile: "robots.txt", data: "User-agent: *\nAllow: /\n" },
    { path: "/llms.txt", kind: "well-known", outputFile: "llms.txt", data: "Public Studio\n" },
  ], failed: [] }, assets: { succeeded: assets.map(([url, data]) => ({ url, outputFile: url.slice(1), data: Buffer.from(data) })), failed: [] } };
}

async function downloadFixture({ theme = "zoran-poster", slug = "zoran-new", documents = true, extraAssets = [], extraHtml = "", configure = () => {} }: {
  theme?: string; slug?: string; documents?: boolean; extraAssets?: ExportReport["assets"]["succeeded"]; extraHtml?: string; configure?: (report: ExportReport) => void;
} = {}, _options = {}) {
  const rendered = downloadReport({ outputDir: "unused-render-directory", theme, documents });
  rendered.assets.succeeded.push(...extraAssets);
  configure(rendered);
  for (const route of rendered.routes.succeeded) {
    if (route.outputFile.endsWith(".html")) route.data = route.data.replace("</body>", extraHtml + "</body>");
  }
  const copy = await captureStaticSite({ now,
    context: async () => ({ name: "Public Studio", slug, theme, timeZone: "America/Los_Angeles" }),
    render: async ({ outputDir }) => ({ ...rendered, outputDir }) });
  assert.ok(!("reason" in copy), "fixture must capture renderable pages before checking the download layout");
  const archive = await buildStaticSiteZip({ copy, zip: zipFolderFiles });
  const files = await unpack(archive);
  return { archive, copy, files, rendered };
}

/** Find the same page before/after relocation so URL tests fail on URLs, not absent folders. */
function downloadDocument({ files, page }: { files: ReadonlyMap<string, Buffer>; page: string }, _options = {}) {
  const pages = [...files].filter(([name, bytes]) => name.endsWith(".html") && bytes.toString().includes(`data-download-page="${page}"`));
  assert.equal(pages.length, 1, `expected exactly one rendered ${page} page`);
  return new JSDOM(pages[0]![1].toString()).window.document;
}

function downloadText({ files, suffix }: { files: ReadonlyMap<string, Buffer>; suffix: string }, _options = {}) {
  const matches = [...files].filter(([name]) => name.endsWith(suffix));
  assert.equal(matches.length, 1, `expected exactly one ZIP file ending with ${suffix}`);
  return matches[0]![1].toString();
}

test("download ZIP contains the launcher and complete sites/poster tree with clean page folders", async () => {
  const { files } = await downloadFixture();
  const expected = ["Open website.html", "README.txt", "media/portrait.webp", "media/portrait-large.webp", "media/intro.mp4", "media/guide.pdf", ...[
    "index.html", "404.html", "about/index.html", "contact/index.html", "case-studies/index.html", "projects/featured/index.html",
    "css/theme.css", "js/main.js", "js/vendor/library.js", "images/logo.webp",
    "fonts/Display.woff2", "icons/favicon.ico", "manifest.webmanifest", "robots.txt", "llms.txt",
  ].map(name => `sites/poster/${name}`)].map(name => downloadFolder + name);
  assert.deepEqual([...files.keys()].sort(), expected.sort());
});

for (const { theme, slug, expected } of [
  { theme: "zoran-poster", slug: "zoran-new", expected: "poster" },
  { theme: "studio-poster", slug: "zoran-new", expected: "studio-poster" },
  { theme: "zoran-", slug: "zoran-new", expected: "zoran-" },
]) {
  test(`download theme folder: ${theme} with ${slug} becomes ${expected}`, async () => {
    const { files } = await downloadFixture({ theme, slug });
    assert.ok(files.has(`${downloadFolder}sites/${expected}/index.html`), `missing sites/${expected}/index.html`);
    assert.ok(files.has(`${downloadFolder}sites/${expected}/css/theme.css`));
    const launcher = new JSDOM(downloadText({ files, suffix: "/Open website.html" })).window.document;
    assert.equal(launcher.querySelector("a")?.getAttribute("href"), `sites/${expected}/index.html`);
  });
}

for (const { page, prefix } of [{ page: "/", prefix: "" }, { page: "/about", prefix: "../" }, { page: "/projects/featured", prefix: "../../" }]) {
  test(`download ${page} makes CSS, JS, images, fonts, icons, manifest and video relative to its page`, async () => {
    const { files } = await downloadFixture();
    const document = downloadDocument({ files, page });
    const refs = [
      ["css", "href", "css/theme.css"], ["js", "src", "js/main.js"], ["vendor", "src", "js/vendor/library.js"],
      ["theme-image", "src", "images/logo.webp"], ["media-image", "src", "../../media/portrait.webp"],
      ["font", "href", "fonts/Display.woff2"], ["icon", "href", "icons/favicon.ico"], ["manifest", "href", "manifest.webmanifest"],
      ["video", "src", "../../media/intro.mp4"], ["video", "poster", "../../media/portrait.webp"], ["document", "href", "../../media/guide.pdf"],
    ];
    for (const [ref, attribute, target] of refs) {
      assert.equal(document.querySelector(`[data-ref="${ref}"]`)?.getAttribute(attribute!), prefix + target, `${page}: ${ref} ${attribute}`);
    }
  });

  test(`download ${page} links to page files with fragments and preserves external, mailto, tel and hash links`, async () => {
    const { files } = await downloadFixture();
    const document = downloadDocument({ files, page });
    const links = [
      ["home", prefix + "index.html"], ["about", prefix + "about/index.html"], ["contact", prefix + "contact/index.html"],
      ["fragment", prefix + "case-studies/index.html#votetolive"],
      ["external", "https://outside.example.test/about#team"], ["mailto", "mailto:hello@example.test"], ["tel", "tel:+15551234567"], ["hash", "#team"],
    ];
    for (const [ref, expected] of links) assert.equal(document.querySelector(`[data-ref="${ref}"]`)?.getAttribute("href"), expected, ref);
  });

  test(`download ${page} rewrites every srcset candidate and inline CSS URL`, async () => {
    const { files } = await downloadFixture();
    const document = downloadDocument({ files, page });
    assert.equal(document.querySelector('[data-ref="srcset"]')?.getAttribute("srcset"),
      `${prefix}../../media/portrait.webp 1x, ${prefix}../../media/portrait-large.webp 2x, https://cdn.example.test/photo.webp 3x`);
    assert.match(document.querySelector('[data-ref="inline-style"]')!.getAttribute("style")!, new RegExp(`url\\(['"]?${(prefix + "../../").replaceAll(".", "\\.")}media/portrait\\.webp['"]?\\)`));
    assert.match(document.querySelector("style")!.textContent!, new RegExp(`url\\(['"]?${prefix.replaceAll(".", "\\.")}images/logo\\.webp['"]?\\)`));
  });
}

test("download CSS rebases relative fonts and root-relative theme and media URLs from css/", async () => {
  const { files } = await downloadFixture();
  const css = downloadText({ files, suffix: "/theme.css" });
  assert.match(css, /url\(['"]?\.\.\/fonts\/Display\.woff2['"]?\)/);
  assert.match(css, /url\(['"]?\.\.\/images\/logo\.webp['"]?\)/);
  assert.match(css, /url\(['"]?\.\.\/\.\.\/\.\.\/media\/portrait\.webp['"]?\)/);
  assert.match(css, /url\(https:\/\/cdn\.example\.test\/bg\.webp\)/);
});

test("download manifest icons resolve relative to the manifest beside index.html", async () => {
  const { files } = await downloadFixture();
  const manifest = JSON.parse(downloadText({ files, suffix: "/manifest.webmanifest" }));
  assert.deepEqual(manifest, { name: "Public Studio", icons: [{ src: "icons/favicon.ico", sizes: "any" }] });
  assert.ok(files.has(downloadFolder + "sites/poster/manifest.webmanifest"));
});

test("download stores referenced public media once in a shared flat media folder without changing bytes", async () => {
  const { files } = await downloadFixture();
  const media = [...files].filter(([name]) => name.startsWith(downloadFolder + "media/"));
  assert.deepEqual(media.map(([name]) => name.slice(downloadFolder.length)).sort(),
    ["media/guide.pdf", "media/intro.mp4", "media/portrait-large.webp", "media/portrait.webp"]);
  for (const [name, bytes] of [["portrait.webp", "portrait bytes"], ["portrait-large.webp", "large portrait bytes"],
    ["intro.mp4", "video bytes"], ["guide.pdf", "pdf bytes"]]) {
    assert.equal(files.get(downloadFolder + "media/" + name)?.toString(), bytes, name);
  }
  assert.deepEqual([...files.keys()].filter(name => name.startsWith(downloadFolder + "sites/poster/images/")),
    [downloadFolder + "sites/poster/images/logo.webp"], "only theme-owned images belong to the theme");
  assert.ok(![...files.keys()].some(name => /sites\/poster\/(?:videos|files)\//.test(name)));
});

test("download assigns shared media clashes -2 and -3 independently of a theme image with the same name", async () => {
  const { files } = await downloadFixture({ extraHtml: '<link rel="stylesheet" href="/theme-assets/zoran-poster/css/logos.css">', extraAssets: [
    { url: "/m/logo/public.v1/image.webp", outputFile: "m/logo/public.v1/image.webp", data: Buffer.from("first media logo") },
    { url: "/m/logo/original.webp", outputFile: "m/logo/original.webp", data: Buffer.from("second media logo") },
    { url: "/m/logo/thumbnail.v2/image.webp", outputFile: "m/logo/thumbnail.v2/image.webp", data: Buffer.from("third media logo") },
    { url: "/theme-assets/zoran-poster/css/logos.css", outputFile: "theme-assets/zoran-poster/css/logos.css",
      data: Buffer.from('.theme{background:url(/theme-assets/zoran-poster/assets/logo.webp)}.first{background:url(/m/logo/public.v1/image.webp)}.second{background:url(/m/logo/original.webp)}.third{background:url(/m/logo/thumbnail.v2/image.webp)}') },
  ] });
  assert.equal(files.get(downloadFolder + "sites/poster/images/logo.webp")?.toString(), "theme logo");
  assert.equal(files.get(downloadFolder + "media/logo.webp")?.toString(), "first media logo");
  assert.equal(files.get(downloadFolder + "media/logo-2.webp")?.toString(), "second media logo");
  assert.equal(files.get(downloadFolder + "media/logo-3.webp")?.toString(), "third media logo");
  const css = downloadText({ files, suffix: "/logos.css" });
  assert.match(css, /\.theme\{background:url\(['"]?\.\.\/images\/logo\.webp['"]?\)\}/);
  assert.match(css, /\.first\{background:url\(['"]?\.\.\/\.\.\/\.\.\/media\/logo\.webp['"]?\)\}/);
  assert.match(css, /\.second\{background:url\(['"]?\.\.\/\.\.\/\.\.\/media\/logo-2\.webp['"]?\)\}/);
  assert.match(css, /\.third\{background:url\(['"]?\.\.\/\.\.\/\.\.\/media\/logo-3\.webp['"]?\)\}/);
});

test("download without public documents has shared images and video and no per-theme media directories", async () => {
  const { archive, files } = await downloadFixture({ documents: false });
  assert.ok(files.has(downloadFolder + "media/portrait.webp"));
  assert.ok(files.has(downloadFolder + "media/intro.mp4"));
  assert.ok(!files.has(downloadFolder + "media/guide.pdf"));
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    assert.doesNotMatch(entry.entryPath, /(?:^|\/)(?:files|videos)(?:\/|$)/, "no empty per-theme files/ or videos/ directory either");
  }
});

test("download excludes unreferenced public media while retaining media used by pages and their CSS", async () => {
  const { files } = await downloadFixture({ extraHtml: '<link rel="stylesheet" href="/theme-assets/zoran-poster/css/media-only.css">', extraAssets: [
    { url: "/m/unused/original.pdf", outputFile: "m/unused/original.pdf", data: Buffer.from("unreferenced public PDF") },
    { url: "/m/wallpaper/original.png", outputFile: "m/wallpaper/original.png", data: Buffer.from("CSS-only public image") },
    { url: "/theme-assets/zoran-poster/css/media-only.css", outputFile: "theme-assets/zoran-poster/css/media-only.css",
      data: Buffer.from(".wallpaper{background:url(/m/wallpaper/original.png)}") },
  ] });
  assert.ok(![...files].some(([name, bytes]) => /unused/.test(name) || bytes.toString().includes("unreferenced public PDF")));
  assert.equal(files.get(downloadFolder + "media/guide.pdf")?.toString(), "pdf bytes");
  assert.equal(files.get(downloadFolder + "media/wallpaper.png")?.toString(), "CSS-only public image");
  assert.match(downloadText({ files, suffix: "/media-only.css" }), /url\(['"]?\.\.\/\.\.\/\.\.\/media\/wallpaper\.png['"]?\)/);
});

test("download Open website.html has a relative meta refresh and plain link to the delivered home page", async () => {
  const { files } = await downloadFixture();
  const document = new JSDOM(downloadText({ files, suffix: "/Open website.html" })).window.document;
  assert.match(document.querySelector('meta[http-equiv="refresh"]')!.getAttribute("content")!, /^0;\s*url=sites\/poster\/index\.html$/i);
  assert.equal(document.querySelector("a")?.getAttribute("href"), "sites/poster/index.html");
  assert.ok(document.querySelector("a")!.textContent!.trim().length > 0);
  assert.ok(files.has(downloadFolder + "sites/poster/index.html"));
});

test("a partial download without its home page opens a surviving content page", async () => {
  const { files } = await downloadFixture({ configure: report => {
    report.routes.succeeded = report.routes.succeeded.filter(route => route.path !== "/");
    report.routes.failed.push({ path: "/", kind: "home", reason: "render failed" });
  } });
  const launcher = new JSDOM(downloadText({ files, suffix: "/Open website.html" })).window.document;
  const href = launcher.querySelector("a")!.getAttribute("href")!;
  assert.equal(href, "sites/poster/about/index.html");
  assert.ok(files.has(downloadFolder + href), "launcher must open a delivered page after partial failure");
  assert.match(downloadText({ files, suffix: "/README.txt" }), /Not included: Page \/ could not be rendered\./);
});

test("download README describes final entries and file-relative links", async () => {
  const { files } = await downloadFixture();
  const readme = downloadText({ files, suffix: "/README.txt" });
  assert.ok(readme.includes('To look at it: extract the ZIP, then double-click "Open website.html".\nTo publish it by hand: upload sites/poster/ and media/ together, keeping them side by side.\n'), "README must explain extraction, double-clicking and the delivered hierarchy");
  assert.doesNotMatch(readme, /Open with any static web host \(links start at the site root\)\./);
  assert.doesNotMatch(readme, /paths starting at the site root/);
  assert.match(readme, /^Public Studio — static copy\nExported: Friday, October 30, 2026 at 10:15 AM PDT \(2026-10-30T10:15:00-07:00\)\nTheme: zoran-poster\nContains: 5 pages and posts, 4 images, 1 video\./);
  assert.match(readme, /No public domain is set, so sitemap.xml was left out\./);
  assert.equal(readme, [
    "Public Studio — static copy",
    "Exported: Friday, October 30, 2026 at 10:15 AM PDT (2026-10-30T10:15:00-07:00)",
    "Theme: zoran-poster",
    "Contains: 5 pages and posts, 4 images, 1 video.",
    'To look at it: extract the ZIP, then double-click "Open website.html".',
    "To publish it by hand: upload sites/poster/ and media/ together, keeping them side by side.",
    "Page, asset, social images and llms.txt links are relative to their containing files; external links keep their URLs.",
    "No public domain is set, so sitemap.xml was left out.",
    "The Sitemap line in robots.txt was removed and feed.xml was left out because both need absolute public URLs.",
    "Canonical and og:url metadata and JSON-LD url/@id values were removed.", "",
  ].join("\n"));
});

test("static completion after polling includes opening instructions while pending stays progress-only", async t => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const backend = createSiteShareBackend({ registry: new SiteShareRegistry({ directory: await rootFor(t) }), site: "ws", zip: zipFolderFiles,
    prepare: async () => { throw new Error("no backup"); }, delivery: async () => undefined,
    staticSite: { context, now, render: async ({ outputDir }) => { await hold; return report(outputDir); } } });
  const input = { principalId: "owner", signal: new AbortController().signal, format: "static" as const };
  const pending = await backend.create(input, { waitMs: 1 }) as { jobId: string };
  assert.ok(pending.jobId);
  assert.ok(!("message" in pending));
  release();
  const complete = await backend.create({ ...input, jobId: pending.jobId }, { waitMs: 60_000 }) as { message: string };
  assert.match(complete.message, /Extract the ZIP, then double-click “Open website.html”/);
});

for (const publicOrigin of [undefined, "https://public.example.test"]) {
  test(`download README counts final files and llms/social links resolve with origin ${publicOrigin}`, async () => {
    const { files } = await downloadFixture({ extraHtml: '<meta property="og:image" content="/m/portrait/public.v1/image.webp">',
      extraAssets: [{ url: "/m/unused/original.png", outputFile: "m/unused/original.png", data: Buffer.from("unused") }],
      configure: rendered => {
        rendered.publicOrigin = publicOrigin;
        rendered.routes.succeeded.find(route => route.path === "/llms.txt")!.data = `# Public Studio\n- [About](${publicOrigin ?? ""}/about?from=llms#team): Meet us\n`;
        rendered.routes.succeeded.push({ path: "/old", kind: "redirect", outputFile: "old/index.html", data: renderRedirectStub({ location: "/about" }) });
        rendered.routes.failed.push({ path: "/broken", kind: "page", reason: "render failure" });
      } });
    const readme = downloadText({ files, suffix: "/README.txt" });
    assert.match(readme, /Contains: 5 pages and posts, 4 images, 1 video\./);
    assert.match(readme, /Not included: Page \/broken could not be rendered\./);
    assert.match(readme, /social images and llms.txt links are relative to their containing files/);
    assert.doesNotMatch(readme, /paths starting at the site root/);
    assert.ok(!files.has(downloadFolder + "media/unused.png"));
    const llmsPath = downloadFolder + "sites/poster/llms.txt";
    const llms = files.get(llmsPath)!.toString();
    assert.equal(llms, "# Public Studio\n- [About](about/index.html?from=llms#team): Meet us\n");
    for (const [source, value] of [[llmsPath, /\]\(([^)]+)\)/.exec(llms)![1]!],
      [downloadFolder + "sites/poster/index.html", downloadDocument({ files, page: "/" }).querySelector('meta[property="og:image"]')!.getAttribute("content")!]]) {
      const destination = new URL(value, "https://zip.test/" + source).pathname.slice(1);
      assert.ok(files.has(destination), `${source} -> ${value} resolves to delivered ${destination}`);
    }
    if (publicOrigin) assert.doesNotMatch(readme, /No public domain is set/);
    else assert.match(readme, /No public domain is set, so sitemap.xml was left out/);
  });
}

for (const [rules, expected] of [["", "User-agent: *\nAllow: /\n"], ["User-agent: *\nDisallow: /private\n", "User-agent: *\nDisallow: /private\n"]]) {
  test(`download robots preserves configured rules or defaults when empty: ${JSON.stringify(rules)}`, async () => {
    const { files, rendered } = await downloadFixture({ configure: report => { report.routes.succeeded.find(route => route.path === "/robots.txt")!.data = rules; } });
    assert.equal(downloadText({ files, suffix: "/robots.txt" }), expected);
    assert.equal(rendered.routes.succeeded.find(route => route.path === "/robots.txt")!.data, rules, "capture/publish bytes stay unchanged");
  });
}

for (const publicOrigin of [undefined, "https://public.example.test"]) {
  for (const sitemapEnabled of [false, true]) {
    for (const rules of ["", "User-agent: *\nDisallow: /\n"]) {
      test(`robots origin policy and ZIP packaging: origin=${publicOrigin}, sitemap=${sitemapEnabled}, rules=${!!rules}`, async () => {
        const body = rules + (sitemapEnabled ? "Sitemap: http://127.0.0.1:3456/sitemap.xml\n" : "");
        const response = await rewriteExportOriginResponse({ response: new Response(body, { headers: { "content-type": "text/plain" } }),
          url: "http://127.0.0.1:3456/robots.txt", publicOrigin });
        const captured = await response.text();
        const { files } = await downloadFixture({ configure: report => {
          report.publicOrigin = publicOrigin;
          report.routes.succeeded.find(route => route.path === "/robots.txt")!.data = captured;
        } });
        const robots = downloadText({ files, suffix: "/robots.txt" });
        assert.equal(robots, captured.trim() ? captured : "User-agent: *\nAllow: /\n");
        assert.equal(robots.includes("Sitemap:"), !!publicOrigin && sitemapEnabled);
        if (rules) assert.ok(robots.startsWith(rules), "configured blocking rules are preserved");
        assert.doesNotMatch(robots, /127\.0\.0\.1/);
      });
    }
  }
}

for (const [from, destination] of [["our-why", "/about?ref=old#team"], ["old/nested", "/projects/featured?ref=old#work"], ["external", "https://elsewhere.test/path?q=1#there"]]) {
  test(`download redirect ${from} retains relative refresh and fallback destination`, async () => {
    const { files } = await downloadFixture({ configure: rendered => rendered.routes.succeeded.push({ path: "/" + from, kind: "redirect", outputFile: `${from}/index.html`, data: renderRedirectStub({ location: destination }) }) });
    const source = downloadFolder + `sites/poster/${from}/index.html`;
    const doc = new JSDOM(files.get(source)!.toString()).window.document;
    const href = doc.querySelector("a")!.getAttribute("href")!;
    const refresh = doc.querySelector('meta[http-equiv="refresh"]')!.getAttribute("content")!;
    assert.equal(refresh.replace(/^0;\s*/, "0;"), "0;url=" + href);
    assert.equal(doc.querySelector("[data-download-page]"), null, "stub contains no destination page body");
    const target = new URL(href, "https://zip.test/" + source);
    assert.equal(target.search, new URL(destination, "https://zip.test").search);
    assert.equal(target.hash, new URL(destination, "https://zip.test").hash);
    if (destination.startsWith("https:")) assert.equal(target.href, destination);
    else assert.ok(files.has(target.pathname.slice(1)));
  });
}

test("download leaves no theme-assets, m, public.v1 or root-relative page or asset references in any HTML, CSS or manifest", async () => {
  const { files } = await downloadFixture();
  const textFiles = [...files].filter(([name]) => /\.(?:html|css|webmanifest)$/.test(name));
  assert.ok(textFiles.length >= 8, "absence checks must include rendered pages, CSS and manifest");
  for (const [name, bytes] of textFiles) {
    assert.doesNotMatch(bytes.toString(), /\/theme-assets\/|\/m\/|public\.v1/, name);
    assert.doesNotMatch(bytes.toString(), /(?:\b(?:href|src|poster)\s*=\s*['"]|url\(\s*['"]?|"src"\s*:\s*")\/(?!\/)/i, name);
    assert.doesNotMatch(bytes.toString(), /\bsrcset\s*=\s*['"][^'"]*(?:^|[\s,'"])\/(?!\/)/i, name);
  }
});

test("the full Tovu backup has no static_site entries or inventory records from a successful capture", async () => {
  const { copy } = await downloadFixture();
  const archive = await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() });
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
    assert.doesNotMatch(entry.entryPath, /(?:^|\/)static_site(?:\/|$)/, "no static_site files or directory entries");
  }
  const backup = await unpack(archive);
  assert.equal(backup.get("content.db")?.toString(), "projected database");
  assert.equal(backup.get("settings.json")?.toString(), "{}");
  const manifest = JSON.parse(backup.get("manifest.json")!.toString());
  assert.ok(!manifest.files.some((file: { path: string }) => isStaticSitePath({ path: file.path })));
});

test("download README reports Sign in on each page that links to /signin", async () => {
  const { files } = await downloadFixture({ extraHtml: '<a href="/signin">Sign in</a><a href="/signin">Account</a>' });
  const readme = downloadText({ files, suffix: "/README.txt" });
  for (const page of ["/", "/about", "/contact", "/case-studies", "/projects/featured", "/not-found"]) {
    const line = `Needs a server (does not work in this copy): Sign in on ${page}.`;
    assert.equal(readme.split("\n").filter(text => text === line).length, 1, `one Sign in note for ${page}`);
  }
  for (const [name, bytes] of files) {
    if (name.endsWith(".html")) assert.doesNotMatch(bytes.toString(), /(?:href|src)=["']\/(?!\/)/, name);
  }
});

test("selected themes share media by URL, keep distinct renditions and scope nested links; one launcher and README", async () => {
  const first = await downloadFixture({ theme: "zoran-poster", extraHtml: '<img src="/m/portrait/other/image.webp">', extraAssets: [{ url: "/m/portrait/other/image.webp", outputFile: "m/portrait/other/image.webp", data: Buffer.from("different rendition") }] });
  const second = await downloadFixture({ theme: "zoran-editorial", configure: rendered => { rendered.routes.failed.push({ path: "/editorial-gap", kind: "page", reason: "failure" }); } });
  for (const activeThemeId of ["zoran-editorial", "not-selected"]) {
    const files = await unpack(await buildStaticSiteZip({ copy: first.copy, copies: [first.copy, second.copy], activeThemeId, zip: zipFolderFiles }));
    const names = [...files.keys()];
    assert.ok(files.has(downloadFolder + "sites/poster/index.html"));
    assert.ok(files.has(downloadFolder + "sites/editorial/index.html"));
    assert.equal(names.filter(name => name.endsWith("/media/portrait.webp")).length, 1);
    assert.equal(files.get(downloadFolder + "media/portrait-2.webp")?.toString(), "different rendition");
    const nested = files.get(downloadFolder + "sites/editorial/projects/featured/index.html")!.toString();
    assert.match(nested, /href="..\/..\/about\/index.html"/);
    assert.match(nested, /src="..\/..\/..\/..\/media\/portrait.webp"/);
    assert.match(files.get(downloadFolder + "Open website.html")!.toString(), new RegExp(`sites/${activeThemeId === "zoran-editorial" ? "editorial" : "poster"}/index.html`));
    const readme = files.get(downloadFolder + "README.txt")!.toString();
    assert.match(readme, /Theme: zoran-poster/);
    assert.match(readme, /Theme: zoran-editorial\nContains: 5 pages and posts, 4 images, 1 video\./);
    assert.match(readme, /editorial-gap/);
    assert.match(readme, /Shared media: 5 files/);
    assert.equal(names.filter(name => name.endsWith("/README.txt")).length, 1);
  }
});

test("combined limits count shared media once and refuse one extra page before encoding", async () => {
  const { copy } = await downloadFixture();
  const media = Array.from({ length: 4 }, (_, index) => ({ path: `m/item-${index}/original.webp`, content: Buffer.from("shared") }));
  const pages = Array.from({ length: 997 }, (_, index) => ({ path: index === 0 ? "index.html" : `p-${index}/index.html`, content: Buffer.from(media.map(file => `<img src="/${file.path}">`).join("")) }));
  const files = [...pages, ...media];
  const first = { ...copy, themeId: "zoran-first", files }, second = { ...copy, themeId: "zoran-second", files };
  let encoded = 0;
  const zip: typeof zipFolderFiles = async input => { encoded++; assert.equal(input.files.length, 2000); return zipFolderFiles(input); };
  await buildStaticSiteZip({ copy: first, copies: [first, second], zip });
  assert.equal(encoded, 1);
  const extra = { ...second, files: [...files, { path: "extra/index.html", content: Buffer.from("extra") }] };
  await assert.rejects(buildStaticSiteZip({ copy: first, copies: [first, extra], zip }), { code: "LIMIT_EXCEEDED" });
  assert.equal(encoded, 1);
});

test("full roster folder aliases stay identical when only one colliding theme is selected", async () => {
  const { allocateStaticExportThemes } = await import("../static-export-selection.js");
  const { copy } = await downloadFixture({ theme: "zoran-poster" });
  const themes = allocateStaticExportThemes({ themeIds: ["zoran-poster", "poster"], siteSlug: "zoran-site" });
  const files = await unpack(await buildStaticSiteZip({ copy, themes, zip: zipFolderFiles }));
  assert.ok(files.has(downloadFolder + "sites/poster-2/index.html"));
  assert.match(files.get(downloadFolder + "Open website.html")!.toString(), /sites\/poster-2\/index.html/);
  assert.match(files.get(downloadFolder + "sites/poster-2/about/index.html")!.toString(), /href="..\/index.html"/);
});
