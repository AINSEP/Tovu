import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock, type TestContext } from "node:test";
import * as yauzl from "yauzl";
import type { StaticSiteCopy } from "../static-copy.js";

// Exercise the real limit policy with small buffers instead of allocating hundreds of MiB.
mock.module("@tovu/contracts/site-share-limits", { namedExports: { SHARE_LIMITS: {
  maxArchiveBytes: 3000, maxExpandedBytes: 3000, maxFiles: 2000,
  maxFileBytes: 2000, maxManifestBytes: 2000, maxPathSegments: 32,
} } });
const staticCopy = await import("../static-copy.js");
const landing = await import("../static-download-landing.js");
const landingHtml = Buffer.from("<!doctype html><title>Fixture landing</title>");
// Isolate the retained-buffer budget from incidental landing CSS; keep real layout and ZIP limits.
mock.module("../static-download-landing.js", { namedExports: { ...landing,
  staticLandingPage: () => landingHtml,
} });
let capture: typeof staticCopy.captureStaticSite;
mock.module("../static-copy.js", { namedExports: { ...staticCopy,
  captureStaticSite: (...args: Parameters<typeof capture>) => capture(...args),
} });
const { createSiteShareBackend } = await import("../share-backend.js");
const { SiteShareRegistry } = await import("../share-registry.js");
const { zipFolderFiles } = await import("@jini-ai/agent-plugins/folder-zip");
const { createShareArchiveReader } = await import("../import-archive-reader.js");

type Copy = Exclude<StaticSiteCopy, { reason: string }>;
function copy(themeId: string, files: Copy["files"]): Copy {
  return { themeId, filename: "site-static-2026-10-30-1715.zip", metadata: { exportedAt: "2026-10-30", theme: themeId,
    routes: ["/"], failed: { routes: [], assets: [] }, skipped: { routes: [], assets: [], references: [] } },
  files: [{ path: "index.html", content: Buffer.from('<img src="/m/shared/image.png">') }, ...files] };
}

async function backendFor(t: TestContext, themeIds: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), "static-limits-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let zips = 0;
  let archive = Buffer.alloc(0);
  const backend = createSiteShareBackend({ registry: new SiteShareRegistry({ directory }), site: "site",
    prepare: async () => { throw new Error("unexpected backup"); }, delivery: async () => undefined,
    zip: async input => {
      zips++;
      const encoded = await zipFolderFiles(input);
      archive = Buffer.from(await encoded.arrayBuffer());
      return encoded;
    },
    staticSite: { now: () => new Date(), context: async () => ({ name: "Site", slug: "site", theme: "a", themeId: "a" }),
      themes: () => themeIds.map(themeId => ({ themeId, title: themeId })) },
  });
  return { start: () => backend.create({ principalId: "owner", format: "static", themeIds,
    signal: new AbortController().signal }, { waitMs: 60_000 }), zips: () => zips, archive: () => archive };
}

test("shared media buffers are deduplicated before collecting the next theme", async t => {
  const first = copy("a", [{ path: "m/shared/image.png", content: Buffer.alloc(1800, 1) }]);
  const second = copy("b", [{ path: "m/shared/image.png", content: Buffer.alloc(1800, 2) }]);
  let captures = 0;
  capture = async () => {
    captures++;
    if (captures === 1) return first;
    if (captures === 2) return second;
    assert.ok(second.files[1]!.content === first.files[1]!.content,
      "the previous capture must release the duplicate media buffer before the next render");
    return copy("c", []);
  };
  const backend = await backendFor(t, ["a", "b", "c"]);
  assert.ok((await backend.start() as { shareId: string }).shareId);
  assert.equal(captures, 3);
  assert.equal(backend.zips(), 1);
  const files = new Map<string, Buffer>();
  for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive: backend.archive() })) {
    assert.equal(entry.kind, "file");
    const chunks: Buffer[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
    files.set(entry.entryPath, Buffer.concat(chunks));
  }
  const folder = "site-static-2026-10-30-1715/";
  assert.deepEqual([...files.keys()].sort(), [
    "index.html", "media/shared.png", "sites/a/index.html", "sites/b/index.html", "sites/c/index.html",
  ].map(name => folder + name));
  assert.deepEqual(files.get(folder + "media/shared.png"), first.files[1]!.content);
  assert.deepEqual(files.get(folder + "index.html"), landingHtml);
});

test("unique retained bytes stop collection at the cap before another theme or ZIP runs", async t => {
  let captures = 0;
  capture = async (_ports, { themeId } = {}) => {
    captures++;
    return copy(themeId!, [{ path: `theme-assets/${themeId}/image.png`, content: Buffer.alloc(1600) }]);
  };
  const backend = await backendFor(t, ["a", "b", "c"]);
  await assert.rejects(backend.start(), { code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
  assert.equal(captures, 2, "do not render any more themes after the retained byte cap is exceeded");
  assert.equal(backend.zips(), 0);
});
