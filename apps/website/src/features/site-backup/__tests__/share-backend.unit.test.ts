/**
 * Pins the share backend's create paths the integration suites leave implicit: the default wait
 * budget and the archive progress totals once preparation has buffered files. Refusals, cancel,
 * resume and revoke are pinned in share-refusals.integration and share-delivery.integration.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { SiteSharePlanContent } from "../plan-store.js";
import { createSiteShareBackend } from "../share-backend.js";
import { SiteShareRegistry } from "../share-registry.js";
import { SiteShareExportFailure } from "../share-export-failure.js";

for (const step of ["prepare", "archive", "delivery"] as const) {
  test(`a ${step} exception keeps its actual step when collected by a later job poll`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const cause = new Error(`ERR-1234-5678-9ABC-DEF0 ${step} failed password=CANARY_EXPORT`);
    const fail = async (): Promise<never> => { entered(); await gate; throw cause; };
    const registry = {} as SiteShareRegistry;
    const backend = createSiteShareBackend({ registry, site: "ws",
      prepare: step === "prepare" ? fail : async () => content(),
      zip: step === "archive" ? fail : async () => new File(["zip"], "test.zip"),
      delivery: step === "delivery" ? fail : async () => undefined,
    }, { now: () => Date.parse("2026-11-04T12:00:00Z"), jiniVersion: "test-jini" });
    const signal = new AbortController().signal;
    const waiting = backend.create({ principalId: "owner", signal }, { waitMs: 0 });
    await Promise.race([reached, waiting.then(() => assert.fail(`export settled before reaching ${step}`))]);
    t.mock.timers.tick(0);
    const pending = await waiting as { jobId: string };
    assert.ok(pending.jobId);
    release();
    await assert.rejects(backend.create({ principalId: "owner", jobId: pending.jobId, signal }), error => {
      assert.ok(error instanceof SiteShareExportFailure);
      assert.equal(error.step, step);
      assert.equal(error.cause, cause);
      assert.equal(error.time, "2026-11-04T12:00:00.000Z");
      assert.equal(error.jiniVersion, "test-jini");
      return true;
    });
    assert.equal(backend.hasWork?.({}), false);
  });
}

async function registryIn(t: TestContext): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-backend-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}
const SETTINGS = { path: "settings.json", content: Buffer.from("{}") };
function content(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    // A v2 share always carries settings.json beside content.db.
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [SETTINGS], skipped: [], scopeNotes: {}, totalBytes: 19,
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z", ...overrides };
}

test("a create without a wait budget waits for a quick export and returns the ZIP-only share", async t => {
  const registry = await registryIn(t);
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => content(), zip: zipFolderFiles, delivery: async () => undefined });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal }) as { status: string; url: string | null; message: string; credentialWarnings: unknown[]; needsAcknowledgement: boolean };
  assert.deepEqual({ status: result.status, url: result.url, message: result.message },
    { status: "active", url: null, message: "ZIP ready. Download zip only. Connect a deployed Tovu site or S3-compatible storage to get a link." });
  assert.deepEqual(result.credentialWarnings, []);
  assert.equal(result.needsAcknowledgement, false);
});

/** Starts an export whose delivery lookup blocks after archiving, and returns its progress at that point. */
async function progressAtDelivery(t: TestContext, plan: SiteSharePlanContent): Promise<{ phase: string; progress: { filesDone: number; filesTotal: number; bytesDone: number; bytesTotal: number } }> {
  const registry = await registryIn(t);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => plan, zip: zipFolderFiles, delivery: async () => { entered(); await gate; return undefined; } });
  assert.equal(backend.hasWork?.({}), false);
  const signal = new AbortController().signal;
  const pending = await backend.create({ principalId: "owner", signal }, { waitMs: 0 }) as { jobId: string };
  // An export that fails before delivery (e.g. a plan v2 refuses) must fail this test with its own
  // refusal now, not leave `started` pending until the runner's timeout.
  const settled = backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 60_000 });
  settled.catch(() => undefined);
  const first = await Promise.race([started.then(() => "delivery" as const), settled.then(() => "settled" as const)]);
  if (first === "settled") assert.fail(`the export settled before delivery: ${JSON.stringify(await settled)}`);
  const progress = await backend.create({ principalId: "owner", jobId: pending.jobId, signal }, { waitMs: 0 }) as Awaited<ReturnType<typeof progressAtDelivery>>;
  assert.equal(backend.hasWork?.({}), true, 'an outstanding upload keeps its warm server');
  release();
  await settled;
  assert.equal(backend.hasWork?.({}), false, 'completion releases protection even with a retained job record');
  return progress;
}
const BUFFERED = [SETTINGS, { path: "themes/site/a.txt", content: Buffer.from("a") }];

test("archive progress reaches its totals: buffered files plus the database, and the planned bytes", async t => {
  const { phase, progress } = await progressAtDelivery(t, content({ bufferedFiles: BUFFERED, totalBytes: 20 }));
  assert.deepEqual({ phase, ...progress }, { phase: "archive-or-upload", filesDone: 3, filesTotal: 3, bytesDone: 20, bytesTotal: 20 });
});

// v2 always carries content.db, so a plan without one is refused before delivery (the v1 quirk this
// pinned, progress one file short of its total, can no longer happen).
test("a share plan without a database is refused before delivery", async t => {
  await assert.rejects(progressAtDelivery(t, content({ database: null, bufferedFiles: BUFFERED, totalBytes: 3 })),
    { code: "INVALID_ARCHIVE", message: "Invalid v2 share manifest, inventory or schema identity." });
});

test("static selection snapshots roster, active identity and time, captures sequentially and encodes once across polling", { timeout: 3000 }, async t => {
  const registry = await registryIn(t);
  const events: string[] = [], directories: string[] = [];
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  let contexts = 0, clocks = 0, rosters = 0, zips = 0;
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => { throw new Error("must not back up DB"); }, delivery: async () => { throw new Error("must not upload"); },
    zip: async input => { zips++; return zipFolderFiles(input); },
    staticSite: { now: () => { clocks++; return new Date("2026-10-30T17:15:00Z"); },
      context: async () => { contexts++; return { name: "Site", slug: "zoran-site", theme: "Poster", themeId: "zoran-poster" }; },
      themes: () => { rosters++; return [{ themeId: "zoran-poster", title: "Poster" }, { themeId: "zoran-editorial", title: "Editorial" }]; },
      render: async ({ outputDir, themeId }) => {
        directories.push(outputDir); events.push(`start:${themeId}`);
        if (themeId === "zoran-editorial") { started(); await gate; }
        events.push(`end:${themeId}`);
        return { outputDir, routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: `<main>${themeId}</main>` }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
      } },
  });
  const signal = new AbortController().signal;
  const selection = ["zoran-editorial", "zoran-poster"];
  const pending = await backend.create({ principalId: "owner", format: "static", themeIds: selection, signal }, { waitMs: 0 }) as { jobId: string };
  const observed = await Promise.race([entered.then(() => "entered"), backend.create({ principalId: "owner", format: "static", jobId: pending.jobId, signal }, { waitMs: 1000 }).then(() => "settled")]);
  assert.equal(observed, "entered");
  selection.reverse(); // A caller mutating its array must not change this running job.
  assert.deepEqual(events, ["start:zoran-editorial"]);
  assert.deepEqual(await backend.create({ principalId: "owner", format: "static", jobId: pending.jobId, signal }, { waitMs: 0 }), { ...pending });
  release();
  const result = await backend.create({ principalId: "owner", format: "static", jobId: pending.jobId, signal }, { waitMs: 60_000 }) as { shareId: string };
  assert.ok(result.shareId);
  assert.deepEqual(events, ["start:zoran-editorial", "end:zoran-editorial", "start:zoran-poster", "end:zoran-poster"]);
  assert.deepEqual({ contexts, clocks, rosters, zips }, { contexts: 1, clocks: 1, rosters: 1, zips: 1 });
  assert.equal(new Set(directories).size, 2);
  const { existsSync } = await import("node:fs");
  for (const directory of directories) assert.equal(existsSync(directory), false);
  assert.deepEqual(await backend.staticOptions({}), { activeThemeId: "zoran-poster", themes: [{ themeId: "zoran-poster", name: "Poster" }, { themeId: "zoran-editorial", name: "Editorial" }] });
});

test("static backend refuses unknown selections before rendering and unusable captures without creating a ZIP", async t => {
  let renders = 0, zips = 0;
  const backend = createSiteShareBackend({ registry: await registryIn(t), site: "ws", prepare: async () => content(), delivery: async () => undefined,
    zip: async input => { zips++; return zipFolderFiles(input); },
    staticSite: { now: () => new Date(), context: async () => ({ name: "Site", slug: "site", theme: "A", themeId: "a" }), themes: () => [{ themeId: "a", title: "A" }, { themeId: "b", title: "B" }],
      render: async ({ outputDir, themeId }) => { renders++; return { outputDir, routes: { succeeded: themeId === "b" ? [] : [{ path: "/", kind: "home", outputFile: "index.html", data: "<main>A</main>" }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }; } },
  });
  const start = (themeIds: string[]) => backend.create({ principalId: "owner", format: "static", themeIds, signal: new AbortController().signal }, { waitMs: 60_000 });
  await assert.rejects(start(["a", "unknown"]), { code: "INVALID_INPUT" });
  assert.equal(renders, 0);
  await assert.rejects(start(["a", "b"]), { code: "UNAVAILABLE" });
  assert.equal(renders, 2); assert.equal(zips, 0);
});

test('theme none offers only Current site and preserves both legacy and picked unstyled exports', async t => {
  const renders: (string | undefined)[] = [];
  const entries = new Map<string, string>();
  const backend = createSiteShareBackend({ registry: await registryIn(t), site: 'ws',
    prepare: async () => content(), delivery: async () => undefined,
    zip: async input => {
      for (const file of input.files) entries.set(file.webkitRelativePath, await file.text());
      return zipFolderFiles(input);
    },
    staticSite: { now: () => new Date('2026-10-30T17:15:00Z'),
      context: async () => ({ name: 'Site', slug: 'site', theme: 'None', themeId: 'none' }),
      themes: () => [{ themeId: 'installed', title: 'Installed' }],
      render: async ({ outputDir, themeId }) => {
        renders.push(themeId);
        return { outputDir, routes: { succeeded: [{ path: '/', kind: 'home', outputFile: 'index.html', data: '<main>Unstyled site</main>' }], failed: [] },
          assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
      } },
  });
  assert.deepEqual(await backend.staticOptions({}), { activeThemeId: 'none', themes: [{ themeId: 'none', name: 'Current site' }] });
  for (const themeIds of [undefined, ['none']]) {
    const result = await backend.create({ principalId: 'owner', format: 'static', themeIds,
      signal: new AbortController().signal }, { waitMs: 60_000 }) as { shareId: string };
    assert.ok(result.shareId);
  }
  assert.deepEqual(renders, ['none', 'none']);
  assert.match([...entries].find(([name]) => name.endsWith('/sites/none/index.html'))![1], /Unstyled site/);
});

for (const publicUrl of [undefined, "https://download.example"]) {
  test(`static completion discloses omitted discovery only without a request domain (${publicUrl ?? "none"})`, async t => {
    const registry = await registryIn(t);
    const seen: (string | undefined)[] = [];
    const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => { throw new Error("static only"); }, delivery: async () => undefined, zip: zipFolderFiles,
      staticSite: { now: () => new Date("2026-10-31T00:00:00Z"), context: async () => ({ name: "Site", slug: "site", theme: "none" }),
        render: async input => { seen.push(input.publicUrl); return { outputDir: input.outputDir, publicOrigin: input.publicUrl,
          routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<main>Site</main>" }], failed: [] },
          assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }; } } });
    const result = await backend.create({ principalId: "owner", signal: new AbortController().signal, format: "static", publicUrl }) as { message: string; notices?: string[] };
    assert.deepEqual(seen, [publicUrl]);
    if (publicUrl) assert.doesNotMatch(result.message, /sitemap.xml.*left out/);
    else {
      assert.match(result.message, /No domain was given.*sitemap.xml and feed.xml were left out/);
      assert.ok(result.notices?.some(notice => /No domain was given.*sitemap.xml and feed.xml were left out/.test(notice)), "completion notice reaches the admin's existing notice surface");
    }
  });
}


test("static options show installed display titles while keeping theme IDs", async () => {
  const backend = createSiteShareBackend({ registry: {} as SiteShareRegistry, site: "site",
    prepare: async () => content(), zip: zipFolderFiles, delivery: async () => undefined,
    staticSite: { now: () => new Date(), context: async () => ({ name: "Site", slug: "studio", theme: "Poster Display", themeId: "studio-poster" }),
      themes: () => [{ themeId: "studio-poster", title: "Poster Display" }, { themeId: "poster", title: "Another Poster" }] },
  });
  assert.deepEqual(await backend.staticOptions!({}), { activeThemeId: "studio-poster", themes: [
    { themeId: "studio-poster", name: "Poster Display" }, { themeId: "poster", name: "Another Poster" },
  ] });
});
