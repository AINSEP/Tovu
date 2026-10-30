import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { ExportReport } from "../../site-export/site-exporter.js";
import { captureStaticSite } from "../static-copy.js";
import { buildShareZip, buildStaticSiteZip } from "../share-zip.js";
import { createShareArchiveReader } from "../import-archive-reader.js";
import { verifySiteImport } from "../import-verifier.js";
import { createSiteShareBackend } from "../share-backend.js";
import { SiteShareRegistry } from "../share-registry.js";
import type { SiteSharePlanContent } from "../plan-store.js";

const now = () => new Date("2026-10-30T17:15:00.000Z");
const context = async () => ({ name: "My Site", slug: "my-site", theme: "Active Theme", timeZone: "America/Los_Angeles" });
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

test("backup ZIP contains static_site/index.html and README.txt with offset time and manifest exportedAt", async () => {
  const copy = await captureStaticSite({ render: async ({ outputDir }) => report(outputDir), context, now });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  assert.equal(files.get("static_site/index.html")?.toString(), "<main>Active theme</main>");
  assert.equal(files.get("static_site/theme-assets/site.css")?.toString(), "body{}");
  assert.equal(files.get("static_site/theme-assets/site.js")?.toString(), "window.site=true;");
  const stamp = files.get("static_site/README.txt")!.toString();
  assert.match(stamp, /2026-10-30T10:15:00-07:00/);
  assert.match(stamp, /10:15 AM PDT/);
  assert.match(stamp, /Friday, October 30, 2026/);
  assert.match(stamp, /Active Theme/);
  assert.match(stamp, /My Site/);
  assert.equal(JSON.parse(files.get("manifest.json")!.toString()).staticSite.exportedAt, "2026-10-30T10:15:00-07:00");
});

test("partial static failures appear plainly in README while full skips stay in the manifest", async () => {
  const copy = await captureStaticSite({ context, now, render: async ({ outputDir }) => ({ ...report(outputDir),
    routes: { ...report(outputDir).routes, failed: [{ path: "/broken", kind: "page", reason: "render failed" }] },
    assets: { succeeded: [], failed: [{ url: "/missing.css", reason: "404" }] },
    skippedManifestEntries: [{ reason: "wildcard", detail: "/old/*" }], unreferencedThemeFiles: ["unused.png"],
  }) });
  const files = await unpack(await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() }));
  const stamp = files.get("static_site/README.txt")!.toString();
  assert.match(stamp, /Not included: Page \/broken could not be rendered\./);
  assert.match(stamp, /Not included: File \/missing.css could not be copied\./);
  assert.doesNotMatch(stamp, /\{|\}|routes|unused.png|old\/|Unreferenced/);
  const metadata = JSON.parse(files.get("manifest.json")!.toString()).staticSite;
  assert.equal(metadata.skipped.routes[0].detail, "/old/*");
  assert.deepEqual(metadata.skipped.assets, ["unused.png"]);
  assert.equal(JSON.parse(files.get("manifest.json")!.toString()).staticSite.failed.routes[0].path, "/broken");
  assert.ok(files.has("content.db"));
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
  assert.equal(files.get("static_site/index.html")?.toString(), "partial");
  assert.match(files.get("static_site/README.txt")!.toString(), /Not included: Page \(export\) could not be rendered\./);
  await assert.rejects(readFile(path.join(folder, "index.html")), { code: "ENOENT" });
});

test("static-only ZIP and top folder use the display name with a dated README and no backup content", async t => {
  const registry = new SiteShareRegistry({ directory: await rootFor(t) });
  const backend = createSiteShareBackend({ registry, site: "ws", zip: zipFolderFiles,
    prepare: async () => { throw new Error("Static export must not snapshot the database"); }, delivery: async () => { throw new Error("Static download must stay local"); },
    staticSite: { context: async () => ({ ...await context(), slug: "internal-old-slug" }), now, render: async ({ outputDir }) => report(outputDir) } });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal, format: "static" }, { waitMs: 60_000 }) as { shareId: string; file: string };
  assert.equal(result.file, "my-site-static-2026-10-30-1015.zip");
  assert.ok(!("message" in result), "a private static download does not suggest missing public hosting");
  const files = await unpack(await readFile(registry.artifactPath({ shareId: result.shareId })));
  assert.deepEqual([...files.keys()].sort(), ["README.txt", "index.html", "theme-assets/site.css", "theme-assets/site.js"].map(file => "my-site-static-2026-10-30-1015/" + file));
});

test("import ignores static_site entirely and restores the same database and files", async () => {
  const copy = await captureStaticSite({ render: async ({ outputDir }) => report(outputDir), context, now });
  const without = await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { packageFiles: new Map() });
  const withStatic = await buildShareZip({ plan: plan(), zip: zipFolderFiles }, { staticCopy: copy, packageFiles: new Map() });
  const verify = (archive: Buffer) => verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema,
    sanitize: async ({ snapshot }) => ({ bytes: snapshot, media: [] }) }, { packageFiles: new Map() });
  assert.deepEqual(await verify(withStatic), await verify(without));
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
