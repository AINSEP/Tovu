import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { composedReporterProbe, secretBearingError } from "#src/server/__tests__/helpers/composed-reporter-probe";
import type { SeoRouteDeps } from "#src/server/runtime/composition/modules/seo";
import { registerFeedRoute, registerLlmsTxtRoute, registerSeoRobotsRoute, registerSeoSitemapRoute } from "../seo-documents.js";

/**
 * @file Wire pins for the four public SEO documents (`/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/feed.xml`).
 * They were hand-written Express routes ending in `res.send(...)`, which gave every answer a `Content-Length`,
 * a weak `ETag`, a bodiless HEAD and a 304 for a fresh conditional GET. They are Jini raw specs now, and the
 * raw writer streams unless the mount selects `bufferedReply` — so a crawler's cache validation would silently
 * stop working with no content-level test noticing. Each document is pinned over a real socket on exactly the
 * four properties a crawler or CDN relies on.
 */

type Registrar = (input: { app: express.Express; deps: SeoRouteDeps }) => void;

const DOCUMENTS: ReadonlyArray<{ path: string; register: Registrar; contentType: RegExp }> = [
  { path: "/sitemap.xml", register: registerSeoSitemapRoute, contentType: /xml/ },
  { path: "/robots.txt", register: registerSeoRobotsRoute, contentType: /text\/plain/ },
  { path: "/llms.txt", register: registerLlmsTxtRoute, contentType: /text\/plain|markdown/ },
  { path: "/feed.xml", register: registerFeedRoute, contentType: /xml/ },
];

/** A conditional GET over `node:http`: `fetch` turns a request carrying `If-None-Match` into a `Cache-Control: no-cache`
 * one (fetch spec, cache mode "no-cache"), and Express never answers 304 to that, so `fetch` cannot revalidate. */
function conditionalGet({ url, etag }: { url: string; etag: string }): Promise<{ status: number; bodyBytes: number }> {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { "if-none-match": etag } }, (res) => {
      let bodyBytes = 0;
      res.on("data", (chunk: Buffer) => { bodyBytes += chunk.length; }).on("end", () => resolve({ status: res.statusCode ?? 0, bodyBytes }));
    }).on("error", reject);
  });
}

async function buildApp(register: Registrar): Promise<express.Express> {
  const base = createRouteDeps();
  await base.siteTitleReady;
  const deps: SeoRouteDeps = { ...base };
  deps.seoDeps = createSeoDeps({ deps }, {});
  deps.sitemapService = createSitemapService({ deps: deps.seoDeps }, {});
  const app = express();
  register({ app, deps });
  return app;
}

for (const { path, register, contentType } of DOCUMENTS) {
  test(`GET ${path}: Content-Length matches the body and an ETag is sent`, async (t) => {
    const baseUrl = await startTestServer(await buildApp(register), t);
    const res = await fetch(`${baseUrl}${path}`, { headers: { "accept-encoding": "identity" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", contentType);
    const body = Buffer.from(await res.arrayBuffer());
    assert.ok(body.length > 0);
    assert.equal(res.headers.get("content-length"), String(body.length));
    assert.match(res.headers.get("etag") ?? "", /^W\/".+"$/);
  });

  test(`HEAD ${path}: the same headers as GET and no body`, async (t) => {
    const baseUrl = await startTestServer(await buildApp(register), t);
    const get = await fetch(`${baseUrl}${path}`, { headers: { "accept-encoding": "identity" } });
    const getBody = await get.arrayBuffer();
    const head = await fetch(`${baseUrl}${path}`, { method: "HEAD", headers: { "accept-encoding": "identity" } });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get("content-length"), String(getBody.byteLength));
    assert.equal(head.headers.get("etag"), get.headers.get("etag"));
    assert.equal(head.headers.get("content-type"), get.headers.get("content-type"));
  });

  test(`GET ${path}: If-None-Match with the current ETag answers a bodiless 304`, async (t) => {
    const baseUrl = await startTestServer(await buildApp(register), t);
    const first = await fetch(`${baseUrl}${path}`);
    const etag = first.headers.get("etag");
    assert.ok(etag, "the first answer carries an ETag to revalidate against");
    await first.arrayBuffer();
    const revalidated = await conditionalGet({ url: `${baseUrl}${path}`, etag });
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.bodyBytes, 0);
    const stale = await conditionalGet({ url: `${baseUrl}${path}`, etag: 'W/"not-the-current-body"' });
    assert.equal(stale.status, 200);
    assert.ok(stale.bodyBytes > 0);
  });
}

/** Codex FIX 4: the SEO document failure writer records through the site's composed reporter. */
test("GET /sitemap.xml: a build failure is one composed incident", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const base = createRouteDeps();
  await base.siteTitleReady;
  const deps: SeoRouteDeps = { ...base };
  deps.seoDeps = createSeoDeps({ deps }, {});
  deps.sitemapService = { ...createSitemapService({ deps: deps.seoDeps }, {}), buildSitemap: async () => { throw thrown; } };
  const app = express();
  app.use((_req, res, next) => { res.locals.failureReporter = probe.reporter; next(); });
  registerSeoSitemapRoute({ app, deps });
  const url = await startTestServer(app, t);
  const response = await fetch(`${url}/sitemap.xml`);
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: /Error ID: (ERR-[0-9A-F-]+)/.exec(await response.text())?.[1], thrown });
});
