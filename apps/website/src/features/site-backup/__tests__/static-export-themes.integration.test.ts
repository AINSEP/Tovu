import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import http, { IncomingMessage, ServerResponse, type RequestListener } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";

import { captureStaticSite } from "../static-copy.js";
import { staticDownloadLayout } from "../static-download-layout.js";
import { claimSharePath, sharePathAlias } from "../share-file-policy.js";
import { buildStaticSiteZip } from "../share-zip.js";
import { createShareArchiveReader } from "../import-archive-reader.js";

// Keep the real Express render/asset handlers, but never open a listening socket in this test.
let currentApp: RequestListener;
const createServer = http.createServer;
mock.method(http, "createServer", (app: RequestListener) => {
  currentApp = app;
  const server = createServer(app);
  server.listen = (() => { queueMicrotask(() => server.emit("listening")); return server; }) as typeof server.listen;
  server.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 43210 });
  server.close = ((callback?: (error?: Error) => void) => { callback?.(); return server; }) as typeof server.close;
  return server;
});
syncBuiltinESMExports();

/** Capture native response bytes before HTTP framing, including streamed media/theme files. */
async function dispatchExportRequest(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  assert.equal(url.origin, "http://127.0.0.1:43210");
  const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = "GET";
  req.url = url.pathname + url.search;
  req.headers = { host: url.host, ...Object.fromEntries(new Headers(init?.headers)) };
  req.push(null);
  const res = new ServerResponse(req);
  res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = [];
  // HTTP's socket drain handshake needs a real connection; capture at the response seam instead.
  res.write = ((chunk: Uint8Array | string, ...args: unknown[]) => {
    chunks.push(Buffer.from(chunk));
    const callback = args.find(arg => typeof arg === "function") as (() => void) | undefined;
    callback?.();
    return true;
  }) as typeof res.write;
  res.end = ((chunk?: Uint8Array | string, ...args: unknown[]) => {
    if (chunk) chunks.push(Buffer.from(chunk));
    res.finished = true;
    res.emit("finish");
    const callback = args.find(arg => typeof arg === "function") as (() => void) | undefined;
    callback?.();
    return res;
  }) as typeof res.end;
  const deadline = setTimeout(() => socket.destroy(new Error("Export request timed out")), 10_000);
  try {
    return await new Promise<Response>((resolve, reject) => {
      socket.on("error", reject);
      res.on("finish", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value !== undefined) headers.set(key, String(value));
        }
        const body = [204, 304].includes(res.statusCode) ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status: res.statusCode, headers }));
      });
      currentApp(req, res);
    });
  } finally { clearTimeout(deadline); socket.destroy(); }
}
mock.method(globalThis, "fetch", dispatchExportRequest);
const { createRouteDeps } = await import("#src/server/runtime/composition/app");
const { uploadMedia } = await import("#src/features/media/index");

/** Use persisted CMS records and stored media bytes, including two URLs for one physical image. */
async function contentFixture({ deps }: { deps: ReturnType<typeof createRouteDeps> }, _options = {}): Promise<string> {
  const { media } = await uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
      filename: "static-export-cover.svg", contentType: "image/svg+xml", createdByPrincipal: "test" },
  });
  const seed = (await deps.postRepo.list({ workspaceId: deps.workspaceId })).find(post => post.kind === "post");
  assert.ok(seed);
  await deps.postRepo.save({ ...seed, id: deps.idGen.newId(), slug: "static-export-content", title: "Static export content",
    bodyFormat: "html", bodyHtml: `<p>Content export</p><img src="/m/${media.slug}/original?copy=one"><img src="/m/${media.slug}/original?copy=two">`,
    status: "published", version: 1 });
  return media.slug;
}

/** Keep the production guard, adding the conflicting pair to integration-test failures. */
function assertPortablePaths({ files }: { files: readonly { path: string }[] }, _options = {}): void {
  const aliases = new Map<string, string>(), claimed = new Set<string>();
  const previous: string[] = [];
  for (const file of files) {
    try { claimSharePath({ path: file.path, directory: false, aliases, files: claimed }); }
    catch (error) {
      const key = sharePathAlias(file);
      const prior = previous.find(name => {
        const alias = sharePathAlias({ path: name });
        return alias === key || alias.startsWith(key + "/") || key.startsWith(alias + "/");
      });
      assert.fail(`Colliding pair: ${JSON.stringify(prior)} and ${JSON.stringify(file.path)}: ${String(error)}`);
    }
    previous.push(file.path);
  }
}

for (const themeIds of [["tovu-starter"], ["tovu-theme"], ["tovu-starter", "tovu-theme"]]) {
  test(`real static download exports ${themeIds.join(" + ")} without colliding paths`, { timeout: 60_000 }, async () => {
    const deps = createRouteDeps();
    await Promise.all([deps.siteTitleReady, deps.identityReady]);
    const mediaSlug = await contentFixture({ deps });
    const copies: Exclude<Awaited<ReturnType<typeof captureStaticSite>>, { reason: string }>[] = [];
    for (const themeId of themeIds) {
      const copy = await captureStaticSite({
        render: required => deps.exportSiteBound(required),
        context: async () => ({ name: "Tovu", slug: "tovu", theme: themeId, themeId, timeZone: "UTC" }),
        now: () => new Date("2026-10-31T19:00:00Z"),
      }, { themeId });
      assert.ok(!("reason" in copy), JSON.stringify(copy));
      assertPortablePaths({ files: copy.files });
      assert.ok(copy.files.some(file => file.path === "static-export-content/index.html"));
      assert.equal(copy.files.filter(file => file.path === `m/${mediaSlug}/original.svg`).length, 1,
        "query variants must produce one physical media claim");
      const home = copy.files.find(file => file.path === "index.html");
      assert.ok(home, `${themeId}: real home must render`);
      assert.ok(home.content.toString().includes(`/theme-assets/${themeId}/`));
      const script = themeId === "tovu-starter" ? "scripts/main.js" : "assets/vendor/kuinetic/kuinetic.all.min.js";
      assert.ok(copy.files.some(file => file.path === `theme-assets/${themeId}/${script}`),
        `${themeId}: the real script must be captured: ${JSON.stringify(copy.metadata.failed)}`);
      copies.push(copy);
    }
    const input = { copy: copies[0]!, copies, activeThemeId: themeIds[0] };
    assertPortablePaths({ files: staticDownloadLayout(input) });
    const archive = await buildStaticSiteZip({ ...input, zip: zipFolderFiles });
    const files = new Map<string, Buffer>();
    for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive })) {
      if (entry.kind !== "file") continue;
      assert.ok(!files.has(entry.entryPath), `Duplicate ZIP entry: ${entry.entryPath}`);
      const chunks: Buffer[] = [];
      for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
      files.set(entry.entryPath, Buffer.concat(chunks));
    }
    const folder = copies[0]!.filename.replace(/\.zip$/i, "");
    assert.ok(files.has(`${folder}/index.html`));
    assert.ok(files.has(`${folder}/media/${mediaSlug}.svg`), "public post media is delivered once across themes");
    for (const themeId of themeIds) {
      const theme = themeId.replace(/^tovu-/, "");
      assert.ok(files.has(`${folder}/sites/${theme}/index.html`));
      const script = themeId === "tovu-starter" ? "scripts/main.js" : "assets/vendor/kuinetic/kuinetic.all.min.js";
      const vendor = copies.find(copy => copy.themeId === themeId)!.files.find(file =>
        file.path === `theme-assets/${themeId}/${script}`)!;
      assert.deepEqual(files.get(`${folder}/sites/${theme}/js/${script.replace(/^scripts\//, "")}`), vendor.content);
    }
  });
}
