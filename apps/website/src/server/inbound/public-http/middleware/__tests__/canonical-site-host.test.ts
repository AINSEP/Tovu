import assert from "node:assert/strict";
import http from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { InMemoryOriginSettingRepo, OriginRegistry, type VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { applyCanonicalSiteHostRedirect } from "../canonical-site-host.js";

const canonical: VerifiedOrigin = {
  scheme: "https", host: "tovu.dev", source: "workspace-setting", verifiedAt: "2026-10-24T00:00:00Z",
};

async function fixture({ t, origin }: { t: TestContext; origin: VerifiedOrigin | null }, _options = {}) {
  const app = express();
  const registry = new OriginRegistry({ repo: new InMemoryOriginSettingRepo({
    seeds: origin ? [{ workspaceId: "site", origin }] : [],
  }) });
  applyCanonicalSiteHostRedirect({ app, originRegistry: registry, workspaceId: "site", runtimeMode: "production" });
  // A downstream sentinel proves excluded requests reached their original handler.
  app.use((_req, res) => res.status(200).send("original handler"));
  const base = await startTestServer(app, t);
  return { app, base, registry };
}

// `fetch` silently drops a caller-set Host header (a forbidden request header), so every request
// here goes through node:http, which sends the Host and the raw request target exactly as given.
function send({ base, path, host }: { base: string; path: string; host: string }, { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; location: string | undefined; body: string }>((resolve, reject) => {
    const request = http.request(base, { method, path, headers: { ...headers, host } }, response => {
      let body = "";
      response.setEncoding("utf8").on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, location: response.headers.location, body }));
    });
    request.on("error", reject).end();
  });
}

test("www pages redirect 308 to the canonical origin with the original path and query", async t => {
  const { base } = await fixture({ t, origin: canonical });
  for (const method of ["GET", "HEAD"]) {
    const path = "/docs/a%2Fb?ref=one&ref=two&next=%2Fpricing";
    const response = await send({ base, path, host: "www.tovu.dev" }, { method });
    assert.equal(response.status, 308);
    assert.equal(response.location, `https://tovu.dev${path}`);
    if (method === "HEAD") assert.equal(response.body, "");
  }
});

test("apex redirects to www when www is canonical, including the configured origin port", async t => {
  const { base } = await fixture({ t, origin: { ...canonical, host: "www.tovu.dev", port: 8443 } });
  const response = await send({ base, path: "/?campaign=fall", host: "tovu.dev:8443" });
  assert.equal(response.status, 308);
  assert.equal(response.location, "https://www.tovu.dev:8443/?campaign=fall");
});

test("canonical, local, unrelated, admin, and API requests reach their original handler", async t => {
  const { base } = await fixture({ t, origin: canonical });
  const cases = [
    { host: "tovu.dev", path: "/" },
    { host: "localhost", path: "/" },
    { host: "127.0.0.1", path: "/" },
    { host: "[::1]", path: "/" },
    { host: "other.example", path: "/" },
    { host: "www.tovu.dev.evil.example", path: "/" },
    { host: "www.www.tovu.dev", path: "/" },
    { host: "www.tovu.dev:8443", path: "/" },
    { host: "www.tovu.dev", path: "/admin" },
    { host: "www.tovu.dev", path: "/admin/settings" },
    { host: "www.tovu.dev", path: "/ADMIN/settings" },
    { host: "www.tovu.dev", path: "/api/site-consent" },
    { host: "www.tovu.dev", path: "/api/site-consent", method: "POST" },
    { host: "www.tovu.dev", path: "/about", method: "POST" },
  ];
  for (const { host, path, method = "GET" } of cases) {
    const response = await send({ base, path, host }, { method, headers: { "x-forwarded-host": "www.tovu.dev" } });
    assert.equal(response.status, 200, `${method} ${host}${path}`);
    assert.equal(response.location, undefined);
    assert.equal(response.body, "original handler");
  }
});

test("missing configuration, dev seeds, localhost and IP canonical origins never redirect", async t => {
  for (const origin of [null, { ...canonical, source: "dev-capability" as const },
    { ...canonical, host: "localhost" }, { ...canonical, host: "preview.localhost" },
    { ...canonical, host: "127.0.0.1" }, { ...canonical, host: "[::1]" }]) {
    const { base } = await fixture({ t, origin });
    const host = origin ? `www.${origin.host}` : "www.tovu.dev";
    const response = await send({ base, path: "/", host });
    assert.equal(response.status, 200);
    assert.equal(response.location, undefined);
  }
});

test("the redirect always retains the configured authority for a double-slash path", async t => {
  const { base } = await fixture({ t, origin: canonical });
  const response = await send({ base, path: "//other.example/path?x=1", host: "WWW.TOVU.DEV" });
  assert.equal(response.status, 308);
  assert.equal(response.location, "https://tovu.dev//other.example/path?x=1");
});

test("registry errors reach Express while excluded routes skip the lookup", async t => {
  const { app, base, registry } = await fixture({ t, origin: canonical });
  const failure = new Error("origin store unavailable");
  registry.canonicalOrigin = async () => { throw failure; };
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    assert.equal(error, failure);
    res.status(503).send("origin unavailable");
  });
  for (const path of ["/admin", "/api/site-consent", "/health", "/healthz", "/readyz"]) {
    const response = await send({ base, path, host: "www.tovu.dev" });
    assert.equal(response.status, 200, path);
  }
  const response = await send({ base, path: "/about", host: "www.tovu.dev" });
  assert.equal(response.status, 503);
  assert.equal(response.body, "origin unavailable");
});

test("an absolute-form request target is passed through instead of joined onto the canonical origin", async t => {
  const { base } = await fixture({ t, origin: canonical });
  const response = await send({ base, path: "http://x@evil.example/p", host: "www.tovu.dev" });
  assert.equal(response.status, 200);
  assert.equal(response.location, undefined);
});

// F6 fix wave (L12 Stryker top-9): the excluded-route pattern is anchored to whole leading segments, so
// page paths that merely CONTAIN or EXTEND an excluded word are still canonicalized.
test("page paths that only resemble admin/api/health routes still redirect to the canonical origin", async t => {
  const { base } = await fixture({ t, origin: canonical });
  for (const path of ["/foo/admin/x", "/administrator", "/apiary", "/healthy-eating", "/blog/api", "/readyz-guide", "/healthz.html"]) {
    const response = await send({ base, path, host: "www.tovu.dev" });
    assert.equal(response.status, 308, path);
    assert.equal(response.location, `https://tovu.dev${path}`);
  }
  for (const path of ["/health", "/healthz", "/readyz", "/api", "/admin/"]) {
    assert.equal((await send({ base, path, host: "www.tovu.dev" })).status, 200, path);
  }
});
