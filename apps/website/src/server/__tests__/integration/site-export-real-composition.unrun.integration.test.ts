// @unrun: authored 2026-10-05 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file The admin static-site export (`POST`/`GET .../system/export`, `routes/system/export-site.ts`)
 * through the REAL `tovu serve <dir>` composition on both dialects, checking the bundle it writes.
 *
 * `export-site-route.test.ts` and `export-site.integration.test.ts` run the export on the hermetic
 * `createRouteDeps()` root with a hand-set `exportOutputRootDir`; nothing exports a site whose content
 * was written over HTTP into SQLite/Postgres, and nothing checks WHERE a booted site's export lands.
 *
 * INTENDED behaviour, asserted here: the export lands under the BOOTED site's own `out/export`, never
 * under the process cwd. Today `resolveExportOutputRootDir()` (`deps.ts`) reads `TOVU_SITE_DIR` or
 * `<cwd>/sites/<TOVU_SITE|tovu-dev>` instead of the composition's `siteBinding.dir`, so the path
 * assertions fail until that is fixed. To keep a pre-fix run from writing into the repo checkout, each
 * test unsets `TOVU_EXPORT_DIR`/`TOVU_SITE_DIR`/`TOVU_SITE` and moves the cwd into its own temp dir
 * BEFORE booting (the root is resolved once, at composition), and restores all four afterwards.
 *
 * The run state is process-global (`features/deployments/export-run.ts`): every test waits for its run
 * to settle before it ends, and node:test runs a file's top-level tests one at a time.
 */

const EXPORT_ENV_KEYS = ["TOVU_EXPORT_DIR", "TOVU_SITE_DIR", "TOVU_SITE"] as const;

interface ExportSnapshot {
  status: "idle" | "running" | "completed" | "errored";
  startedAtIso: string | null;
  finishedAtIso: string | null;
  outputDir: string | null;
  ok?: boolean;
  counts?: { routesSucceeded: number; routesFailed: number; assetsSucceeded: number; assetsFailed: number };
  failedRoutes?: { path: string; kind: string; reason: string }[];
  failedAssets?: { url: string; reason: string }[];
  skippedManifestEntries?: { reason: string; detail: string }[];
  error?: string;
}

interface PostDto {
  id: string;
  slug: string;
  status: string;
}

function doc(text: string): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

/** Unsets the export-root env and moves into a fresh temp cwd; both restored at teardown. Returns that cwd. */
function isolateExportRoot(t: TestContext): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unrun-export-cwd-"));
  const savedCwd = process.cwd();
  const savedEnv = EXPORT_ENV_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of EXPORT_ENV_KEYS) delete process.env[key];
  process.chdir(cwd);
  t.after(() => {
    process.chdir(savedCwd);
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  return cwd;
}

/** Every regular file under `dir`, relative to it, sorted. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

const EXPORT_ROUTE = "/system/export";

async function triggerExport(site: BootedSite, body: unknown): Promise<ExportSnapshot> {
  return expectJson<ExportSnapshot>(await send(site, "POST", `${site.ws}${EXPORT_ROUTE}`, body), 202);
}

/** Polls the status route until the run leaves `running` (a real export fetches every route serially). */
async function waitForSettled(site: BootedSite): Promise<ExportSnapshot> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const snapshot = await expectJson<ExportSnapshot>(await send(site, "GET", `${site.ws}${EXPORT_ROUTE}`), 200);
    if (snapshot.status !== "running") return snapshot;
    if (Date.now() > deadline) throw new Error(`export did not settle in 120s: ${JSON.stringify(snapshot)}`);
    await delay(100);
  }
}

function read(outputDir: string, relative: string): string {
  return fs.readFileSync(path.join(outputDir, relative), "utf8");
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] site export [${dialect}]: the bundle lands in the booted site's out/export with published content, redirect stubs and well-known files; drafts and the cwd stay out`, async (t) => {
    const cwd = isolateExportRoot(t);
    const site = await bootSite(t, dialect);
    const outputDir = path.join(site.siteDir, "out", "export");

    await expectJson(await send(site, "POST", `${site.ws}/pages`, { title: "Unrun Export About", slug: "unrun-export-about", bodyJson: doc("Unrun export page body"), status: "published" }), 201);
    await expectJson(await send(site, "POST", `${site.ws}/posts`, { title: "Unrun Export Post", slug: "unrun-export-post", bodyJson: doc("Unrun export post body"), status: "published" }), 201);
    const draft = (await expectJson<{ post: PostDto }>(await send(site, "POST", `${site.ws}/posts`, { title: "Unrun Export Draft", slug: "unrun-export-draft", bodyJson: doc("Unrun draft body") }), 201)).post;
    assert.equal(draft.status, "draft");
    await expectJson(
      await send(site, "POST", `${site.ws}/redirects`, { matchType: "exact", fromPattern: "/unrun-export-old", toTarget: "/unrun-export-about", statusCode: 301, override: true }),
      201
    );

    const started = await triggerExport(site, {});
    assert.deepEqual(
      { status: started.status, finishedAtIso: started.finishedAtIso, outputDir: started.outputDir },
      { status: "running", finishedAtIso: null, outputDir }
    );

    const settled = await waitForSettled(site);
    assert.equal(settled.status, "completed", `the export completed: ${JSON.stringify(settled)}`);
    assert.equal(settled.outputDir, outputDir, "the completed run reports the booted site's export dir");
    assert.equal(settled.ok, true);
    assert.equal(settled.counts?.routesFailed, 0);
    assert.deepEqual(settled.failedRoutes, []);
    assert.deepEqual(settled.failedAssets, []);
    assert.deepEqual(
      settled.skippedManifestEntries?.map((entry) => entry.reason),
      ["no-favicon-or-manifest-route"],
      "only the always-present favicon note is skipped: one exact redirect, an active theme"
    );

    const files = listFiles(outputDir);
    for (const expected of ["index.html", "404.html", "robots.txt", "sitemap.xml", "llms.txt", "feed.xml", "unrun-export-about/index.html", "unrun-export-post/index.html", "unrun-export-old/index.html"]) {
      assert.ok(files.includes(expected), `the bundle has ${expected}: ${JSON.stringify(files)}`);
    }
    assert.equal(fs.existsSync(path.join(outputDir, "unrun-export-draft")), false, "a draft is never exported");

    assert.ok(read(outputDir, "unrun-export-about/index.html").includes("Unrun export page body"), "the page file carries the stored body");
    assert.ok(read(outputDir, "unrun-export-post/index.html").includes("Unrun export post body"), "the post file carries the stored body");
    assert.ok(
      read(outputDir, "unrun-export-old/index.html").includes(`<meta http-equiv="refresh" content="0; url=/unrun-export-about">`),
      "the redirect rule becomes a meta-refresh stub to the live 301's Location"
    );

    const sitemap = read(outputDir, "sitemap.xml");
    assert.ok(sitemap.includes("/unrun-export-about</loc>") && sitemap.includes("/unrun-export-post</loc>"), sitemap);
    assert.equal(sitemap.includes("unrun-export-draft"), false);
    const feed = read(outputDir, "feed.xml");
    assert.ok(feed.includes("Unrun Export Post"), feed);
    assert.equal(feed.includes("Unrun Export Draft"), false);
    const llms = read(outputDir, "llms.txt");
    assert.ok(llms.startsWith("# Tovu\n"), llms);
    assert.ok(llms.includes("Unrun Export About"), llms);
    assert.equal(llms.includes("Unrun Export Draft"), false);
    assert.ok(read(outputDir, "robots.txt").includes("sitemap.xml"), "robots.txt advertises the sitemap");

    assert.deepEqual(listFiles(cwd).filter((file) => file.endsWith(".html") || file.endsWith(".xml")), [], "nothing was exported under the process cwd");
  });

  test(`[unrun] site export [${dialect}]: a non-boolean clean is 400 and starts nothing; a non-empty export dir errors without clean and is wiped with clean: true`, async (t) => {
    isolateExportRoot(t);
    const site = await bootSite(t, dialect);
    const outputDir = path.join(site.siteDir, "out", "export");

    const before = await expectJson<ExportSnapshot>(await send(site, "GET", `${site.ws}${EXPORT_ROUTE}`), 200);
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}${EXPORT_ROUTE}`, { clean: "yes" }), 400), { error: "'clean' must be a boolean" });
    assert.deepEqual(await expectJson(await send(site, "GET", `${site.ws}${EXPORT_ROUTE}`), 200), before, "a refused trigger leaves the run state untouched");

    fs.mkdirSync(outputDir, { recursive: true });
    const stale = path.join(outputDir, "stale.txt");
    fs.writeFileSync(stale, "left by an earlier export");

    await triggerExport(site, {});
    const refused = await waitForSettled(site);
    assert.deepEqual(
      { status: refused.status, outputDir: refused.outputDir, error: refused.error },
      {
        status: "errored",
        outputDir,
        error: `export output directory '${outputDir}' is not empty (1 existing entry) — pass --clean to remove its contents first, or point --out at an empty/new directory`,
      }
    );
    assert.deepEqual(listFiles(outputDir), ["stale.txt"], "a refused export writes nothing and removes nothing");

    await triggerExport(site, { clean: true });
    const cleaned = await waitForSettled(site);
    assert.equal(cleaned.status, "completed", JSON.stringify(cleaned));
    assert.equal(cleaned.outputDir, outputDir);
    assert.equal(fs.existsSync(stale), false, "clean: true removed the earlier export's file");
    assert.ok(listFiles(outputDir).includes("index.html"), "the fresh bundle replaced it");
  });
}
