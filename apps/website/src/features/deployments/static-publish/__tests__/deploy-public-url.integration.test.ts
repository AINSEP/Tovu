import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import type { Express } from "express";
import type { DeployFile } from "@jini-ai/devops/deploy";
import * as exportEngine from "@jini-ai/devops/static-export";
import * as exportNode from "@jini-ai/devops/static-export/node";
import type { LoadedDeployTarget } from "../../deploy-targets/types.js";
import { OriginNotVerifiedError } from "@jini-ai/http-kit/verified-origin";

// Replace only the export engine's socket/disk transport. The CMS page handler, SEO,
// export response transforms, publish adapter and uploaded bytes all remain real.
mock.module("@jini-ai/devops/static-export/node", { namedExports: {
  ...exportNode,
  createNodeAppFactory: (input: { createApp(): Express }) => input,
} });
mock.module("@jini-ai/devops/static-export", { namedExports: {
  ...exportEngine,
  exportSite: async (input: {
    outputDir: string; app: { createApp(): Express };
    fetch(input: { url: string }): Promise<Response>;
    security: { transformHtml(input: { html: string }): string };
  }) => {
    const app = input.app.createApp();
    const routes = [];
    for (const routePath of ["/", "/sitemap.xml", "/feed.xml", "/robots.txt"]) {
      const body = await homeHtml(app, routePath);
      const contentType = routePath.endsWith(".xml") ? "application/xml" : routePath.endsWith(".txt") ? "text/plain" : "text/html";
      const restore = mock.method(globalThis, "fetch", async () => new Response(body, { headers: { "content-type": contentType } }));
      try {
        const response = await input.fetch({ url: "http://render.invalid" + routePath });
        const text = await response.text();
        const data = routePath === "/" ? input.security.transformHtml({ html: text }) : text;
        routes.push({ path: routePath, outputFile: routePath === "/" ? "index.html" : routePath.slice(1), data, status: 200, contentType });
      } finally { restore.mock.restore(); }
    }
    return { outputDir: input.outputDir, basePath: "/", startedAt: "2026-10-31T00:00:00Z", finishedAt: "2026-10-31T00:00:00Z",
      routes: { succeeded: routes, failed: [], skipped: [] },
      assets: { succeeded: [], failed: [], skipped: [] }, unreferencedThemeFiles: [], droppedReferences: [] };
  },
} });

const { createRouteDeps } = await import("#src/server/runtime/composition/app");
const { publishStaticSite } = await import("../adapter.js");

async function homeHtml(app: Express, routePath = "/"): Promise<string> {
  type Layer = { route?: { path: string; stack: { handle(req: unknown, res: unknown, next: unknown): Promise<void> }[] } };
  const layers = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
  const route = layers.find(layer => layer.route?.path === routePath)?.route;
  assert.ok(route, "public home route is registered");
  let body = "";
  let status = 200;
  const res = { locals: {}, status(code: number) { status = code; return res; }, type() { return res; },
    set() { return res; }, setHeader() {}, getHeader() {}, append() { return res; }, cookie() { return res; },
    send(html: string) { body = html; return res; } };
  const req = { method: "GET", url: routePath, originalUrl: routePath, path: routePath, params: {}, query: {}, headers: {},
    hostname: "render.invalid", protocol: "http", get: (name: string) => name.toLowerCase() === "host" ? "render.invalid" : undefined,
    header: (name: string) => name.toLowerCase() === "x-tovu-static-export" ? "1" : undefined };
  await route.stack[0]!.handle(req, res, () => assert.fail("home route must render"));
  assert.equal(status, 200, body);
  return body;
}

test("a destination resolver failure never uploads or exposes the saved credential", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "deploy-url-refusal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const token = "private-resolver-token";
  const target: LoadedDeployTarget = { pluginId: "fixture", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [] },
    module: { create: () => ({ id: "fixture", resolvePublicUrl: async () => { throw new Error(`Lookup refused Bearer ${token}`); },
      publish: async () => assert.fail("a URL-resolution failure must not upload files"),
      checkReachability: async () => ({ reachable: false }) }) } };
  const outcome = await publishStaticSite({
    credentialSource: { resolve: async () => ({ ok: true, token }), isConfigured: async () => ({ configured: true }) },
    loadDeployTargets: async () => ({ get: () => target, list: () => [target], refusals: [] }),
  }, { workspaceId: "site", config: { target: "fixture" }, projectName: "zoran", publishOutputRootDir: root,
    idGen: { newId: () => "run" }, exportSiteBound: async () => assert.fail("a URL-resolution failure must not render") });
  assert.equal(outcome.ok, false);
  assert.ok(!JSON.stringify(outcome).includes(token), "the existing provider-error redactor must also cover URL resolution");
});

for (const scenario of ["stored localhost", "refused legacy loopback", "another public origin", "destination subpath"]) {
test(`publishing with ${scenario} renders canonical and og:url for the deploy target`, async t => {
  const root = await mkdtemp(path.join(tmpdir(), "deploy-public-url-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = createRouteDeps();
  const stored = { scheme: "https" as const, host: scenario === "another public origin" ? "old.example.test" : "localhost", source: "workspace-setting" as const, verifiedAt: "2026-10-31T00:00:00Z" };
  const registry = { canonicalOrigin: async () => {
    if (scenario === "refused legacy loopback") throw new OriginNotVerifiedError({ message: "legacy loopback is unset" });
    return stored;
  }, isAllowedRedirectTarget: async () => false, isAllowedEgressTarget: async () => false };
  deps.originRegistry = registry;
  deps.seoDeps = { ...deps.seoDeps, originRegistry: deps.originRegistry };
  const url = "https://zoran.vercel.app" + (scenario === "destination subpath" ? "/site" : "");
  let uploaded: readonly DeployFile[] = [];
  const target: LoadedDeployTarget = { pluginId: "fixture", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [] },
    module: { create: () => ({ id: "fixture", resolvePublicUrl: async () => url,
      publish: async input => { uploaded = input.files; return { targetId: "fixture", url, status: "ready" }; },
      checkReachability: async () => ({ reachable: true }) }) } };
  const outcome = await publishStaticSite({
    credentialSource: { resolve: async () => ({ ok: true, token: "test-token" }), isConfigured: async () => ({ configured: true }) },
    loadDeployTargets: async () => ({ get: () => target, list: () => [target], refusals: [] }),
  }, { workspaceId: deps.workspaceId, config: { target: "fixture" }, projectName: "zoran", publishOutputRootDir: root,
    idGen: deps.idGen, exportSiteBound: options => deps.exportSiteBound(options) });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const html = String(uploaded.find(file => file.file === "index.html")?.data);
  assert.ok(html.includes(`rel="canonical" href="${url}/"`), `canonical must use ${url}/`);
  assert.ok(html.includes(`property="og:url" content="${url}/"`), `og:url must use ${url}/`);
  assert.doesNotMatch(html, /localhost/);
  for (const [file, tag] of [["sitemap.xml", "loc"], ["feed.xml", "link"]]) {
    const xml = String(uploaded.find(item => item.file === file)?.data);
    const values = [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g"))].map(match => match[1]!);
    assert.ok(values.length > 0, xml);
    assert.ok(values.every(value => value.startsWith(url + "/")), xml);
  }
  assert.ok(String(uploaded.find(item => item.file === "robots.txt")?.data).includes(`Sitemap: ${url}/sitemap.xml`));
  assert.equal(deps.originRegistry, registry, "a destination must not overwrite the local site's origin");
});
}

for (const resolver of [undefined, async () => ""]) {
  test(`a publish target with ${resolver ? "an empty" : "no"} public URL renders the domainless copy, never the saved domain`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), "deploy-no-public-url-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const requested: unknown[] = [];
    const target: LoadedDeployTarget = { pluginId: "fixture", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [] },
      module: { create: () => ({ id: "fixture", ...(resolver ? { resolvePublicUrl: resolver } : {}),
        publish: async () => ({ targetId: "fixture", url: "https://fixture.example", status: "ready" }), checkReachability: async () => ({ reachable: true }) }) } };
    const outcome = await publishStaticSite({ credentialSource: { resolve: async () => ({ ok: true, token: "test-token" }), isConfigured: async () => ({ configured: true }) },
      loadDeployTargets: async () => ({ get: () => target, list: () => [target], refusals: [] }) },
      { workspaceId: "site", config: { target: "fixture" }, projectName: "Site", publishOutputRootDir: root, idGen: { newId: () => "run" },
        exportSiteBound: async options => { requested.push(options.publicUrl); return { outputDir: options.outputDir, routes: { succeeded: [{ path: "/", kind: "home", outputFile: "index.html", data: "<main>Site</main>" }], failed: [] },
          assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }; } });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(requested, [undefined], "no destination: exportSite omits identity and discovery");
  });
}
