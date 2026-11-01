import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { IncomingMessage, ServerResponse, type RequestListener } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as adapters from "@jini-ai/devops/static-export/node";
import { captureStaticSite } from "../../site-backup/static-copy.js";
import { staticDownloadLayout } from "../../site-backup/static-download-layout.js";

// Reuse the engine's app-factory port; each export has its own in-memory transport address.
const apps = new Map<string, RequestListener>();
let sequence = 0;
mock.module("@jini-ai/devops/static-export/node", { namedExports: { ...adapters,
  createNodeAppFactory: ({ createApp }: { createApp(): RequestListener }) => ({ open: async () => {
    const baseUrl = `http://render-${++sequence}.invalid`;
    apps.set(baseUrl, createApp());
    return { baseUrl, close: async () => { apps.delete(baseUrl); } };
  } }),
} });

async function dispatch(app: RequestListener, address: string, headers: Record<string, string> = {}): Promise<Response> {
  const url = new URL(address), socket = new PassThrough();
  socket.resume();
  Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" });
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = "GET"; req.url = url.pathname + url.search; req.headers = { host: url.host, ...headers }; req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = [], write = res.write.bind(res), end = res.end.bind(res);
  res.write = ((chunk: Uint8Array | string, ...args: unknown[]) => { chunks.push(Buffer.from(chunk)); return write(chunk, ...args as []); }) as typeof res.write;
  res.end = ((chunk?: Uint8Array | string, ...args: unknown[]) => { if (chunk) chunks.push(Buffer.from(chunk)); return end(chunk, ...args as []); }) as typeof res.end;
  const deadline = setTimeout(() => socket.destroy(new Error("render timed out")), 10_000);
  try { return await new Promise<Response>((resolve, reject) => {
    socket.on("error", reject);
    res.on("finish", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode,
      headers: Object.fromEntries(Object.entries(res.getHeaders()).map(([key, value]) => [key, String(value)])) })));
    app(req, res);
  }); } finally { clearTimeout(deadline); socket.destroy(); }
}
mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input)), app = apps.get(url.origin);
  assert.ok(app, `Unexpected outbound request: ${url}`);
  return dispatch(app, url.href, Object.fromEntries(new Headers(init?.headers)));
});
const { createApp, createRouteDeps } = await import("#src/server/runtime/composition/app");
const { exportSite } = await import("../site-exporter.js");

function site(label = "Original") {
  const deps = createRouteDeps();
  deps.themes = [];
  deps.resolveActiveThemeId = async () => "none";
  deps.createSiteApp = () => createApp(deps, { themeIdOverride: "none" });
  // Deliberately stale public identity must never decide where this response is served.
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "https", host: "saved.example", source: "workspace-setting", verifiedAt: "2026-10-31T00:00:00Z" });
  deps.seoDeps = { ...deps.seoDeps, originRegistry: deps.originRegistry,
    siteTitle: async () => label };
  return deps;
}
function absoluteValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g"))].map(match => match[1]!);
}

for (const origin of ["http://localhost:3000", "http://127.0.0.1:4000", "http://live.example"]) {
  test(`live sitemap, feed and canonical follow ${origin}`, async () => {
    const deps = site(), app = createApp(deps, { themeIdOverride: "none" });
    for (const [route, tag] of [["/sitemap.xml", "loc"], ["/feed.xml", "link"]]) {
      const response = await dispatch(app, origin + route), body = await response.text();
      assert.equal(response.status, 200, body);
      const links = absoluteValues(body, tag!);
      assert.ok(links.length > 0, body);
      assert.ok(links.every(link => link.startsWith(origin + "/")), body);
    }
    const html = await (await dispatch(app, origin + "/")).text();
    assert.ok(html.includes(`rel="canonical" href="${origin}/"`), html.slice(0, 3000));
    assert.ok(html.includes(`href="${origin}/feed.xml"`));
    const robots = await (await dispatch(app, origin + "/robots.txt")).text();
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), robots);
  });
}

test("concurrent apps and two request origins keep their own SEO dependencies", async () => {
  const first = site("First site"), appA = createApp(first, { themeIdOverride: "none" });
  const second = site("Second site");
  second.seoDeps = { ...second.seoDeps, postRepo: { ...second.seoDeps.postRepo,
    findById: async input => { const post = await first.seoDeps.postRepo.findById(input); return post && { ...post, title: "Second entry" }; } } };
  const appB = createApp(second, { themeIdOverride: "none" });
  const [a, b, c] = await Promise.all([
    dispatch(appA, "http://localhost:3000/"), dispatch(appB, "http://127.0.0.1:4000/"), dispatch(appA, "http://third.example/")
  ]);
  const [htmlA, htmlB, htmlC] = await Promise.all([a.text(), b.text(), c.text()]);
  assert.ok(htmlA.includes("First site"), htmlA.slice(0, 3000));
  assert.ok(htmlB.includes("Second site"), htmlB.slice(0, 3000));
  for (const [html, origin] of [[htmlA, "http://localhost:3000"], [htmlB, "http://127.0.0.1:4000"], [htmlC, "http://third.example"]]) {
    assert.ok(html!.includes(`rel="canonical" href="${origin}/"`));
    assert.ok(!html!.includes("saved.example"));
  }
});

test("trusted proxy origin includes forwarded port; untrusted forwarding is ignored", async () => {
  const app = createApp(site(), { themeIdOverride: "none" });
  const headers = { "x-forwarded-host": "public.example:8443", "x-forwarded-proto": "https" };
  app.set("trust proxy", false);
  assert.ok((await (await dispatch(app, "http://localhost:3000/feed.xml", headers)).text()).includes("http://localhost:3000/feed.xml"));
  app.set("trust proxy", "loopback");
  assert.ok((await (await dispatch(app, "http://localhost:3000/feed.xml", headers)).text()).includes("https://public.example:8443/feed.xml"));
});

test("a malformed Host header renders with the stored-origin fallback instead of failing", async () => {
  const app = createApp(site(), { themeIdOverride: "none" });
  for (const route of ["/", "/feed.xml", "/sitemap.xml", "/robots.txt"]) {
    const response = await dispatch(app, "http://localhost:3000" + route, { host: "bad.example:99999" });
    assert.equal(response.status, 200, route);
    assert.ok(!(await response.text()).includes("bad.example"), route);
  }
});

for (const publicUrl of [undefined, "https://download.example", "https://user.github.io/repo/"]) {
  test(`static copy domain ${publicUrl ?? "omitted"} controls discovery and SEO`, async () => {
    const deps = site();
    const copy = await captureStaticSite({ render: input => exportSite({ ...input, routeDeps: deps, includeThemePreviews: false }),
      context: async () => ({ name: "Site", slug: "site", theme: "none" }), now: () => new Date("2026-10-31T00:00:00Z") }, { publicUrl });
    assert.ok(!("reason" in copy), JSON.stringify(copy));
    const files = new Map(staticDownloadLayout({ copy }).map(file => [path.posix.basename(file.path), file.content.toString()]));
    if (!publicUrl) {
      assert.ok(!files.has("sitemap.xml")); assert.ok(!files.has("feed.xml"));
      assert.match(files.get("README.txt")!, /sitemap.xml was left out/);
      assert.doesNotMatch(files.get("robots.txt")!, /Sitemap:/);
      assert.doesNotMatch(files.get("index.html")!, /rel="canonical"|application\/rss\+xml/);
    } else {
      const base = publicUrl.replace(/\/$/, "");
      for (const [file, tag] of [["sitemap.xml", "loc"], ["feed.xml", "link"]]) {
        const urls = absoluteValues(files.get(file!)!, tag!);
        assert.ok(urls.length > 0); assert.ok(urls.every(url => url.startsWith(base + "/")), files.get(file!));
      }
      assert.ok(files.get("index.html")!.includes(`rel="canonical" href="${base}/"`));
      assert.ok(files.get("index.html")!.includes(`href="${base}/feed.xml"`));
      assert.ok(files.get("index.html")!.includes('href="index.html"'), "the offline home link must resolve to a delivered file even for a project URL");
    }
  });
}

for (const publicUrl of ["https://user.github.io/repo/", "https://user.github.io/", "https://custom.example/"]) {
test(`publishing discovery uses ${publicUrl} and derives its prefix from that destination`, async t => {
  const deps = site(), outputDir = await mkdtemp(path.join(tmpdir(), "seo-publish-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const report = await exportSite({ routeDeps: deps, outputDir, publicUrl, basePath: "/repo", includeThemePreviews: false });
  assert.deepEqual(report.routes.failed, []);
  const files = new Map(report.routes.succeeded.map(file => [file.outputFile, String(file.data)]));
  for (const [file, tag] of [["sitemap.xml", "loc"], ["feed.xml", "link"]]) {
    const urls = absoluteValues(files.get(file!)!, tag!);
    assert.ok(urls.length > 0); assert.ok(urls.every(url => url.startsWith(publicUrl) && !url.includes("/repo/repo/")), files.get(file!));
  }
  const html = files.get("index.html")!;
  assert.ok(html.includes(`href="${publicUrl}"`));
  assert.ok(html.includes(`href="${publicUrl}feed.xml"`));
  assert.ok(html.includes(`href="${new URL(publicUrl).pathname}"`), "navigation must use the resolved destination's prefix too");
  assert.equal((await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId })).host, "saved.example");
});
}
