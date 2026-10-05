import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { RequestListener } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { exportSite } from "../site-exporter.js";

/**
 * @file Every loopback fetch `exportSite` makes (routes, the 404 probe, assets) is one outbound
 * CLIENT span through `routeDeps.observability`: method, host/port and status only — never the
 * route path, an asset URL or its query. Real loopback server, real OTel SDK (in-memory exporter);
 * `createSiteApp` is the existing injectable seam, swapped for a stand-in renderer so no inbound
 * SERVER span from the real app lands in the same exporter.
 */

const ASSET = "/theme-assets/secret-asset-7f3.css?tok=s3cret-q";

function makeOutputDir(t: TestContext): string {
  const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-export-otel-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  return outputDir;
}

/** The seeded demo workspace, traced into a fresh in-memory exporter, rendered by `render`. */
function tracedDeps(render: RequestListener) {
  const { exporter, port } = createInMemoryOtel();
  const deps = createRouteDeps();
  deps.observability = port;
  deps.createSiteApp = () => render;
  return { deps, exporter };
}

test("exportSite traces every route, probe and asset fetch as one CLIENT span: host, port and status, never a path or query", async (t) => {
  const { deps, exporter } = tracedDeps((req, res) => {
    if (req.url?.startsWith("/theme-assets/")) { res.setHeader("content-type", "text/css"); res.end("body{}"); return; }
    res.statusCode = req.url?.includes("tovu-export-404-check") ? 404 : 200;
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="${ASSET}"></head><body></body></html>`);
  });

  const report = await exportSite({ routeDeps: deps, outputDir: makeOutputDir(t) });

  assert.deepEqual(report.routes.failed, []);
  assert.deepEqual(report.assets.failed, []);
  const spans = exporter.getFinishedSpans();
  // One span per request: every manifest route once, the one shared asset once.
  assert.equal(spans.length, report.routes.succeeded.length + report.assets.succeeded.length);
  assert.ok(report.routes.succeeded.length > 2, "the seeded workspace exports several routes");
  const routePaths = report.routes.succeeded.map((route) => route.path).filter((routePath) => routePath !== "/");
  for (const span of spans) {
    assert.equal(span.name, "GET 127.0.0.1");
    assert.equal(span.kind, SpanKind.CLIENT);
    assert.equal(typeof span.attributes["server.port"], "number");
    assertSpanOmits(span, ["secret-asset-7f3", "s3cret-q", "tovu-export-404-check", "theme-assets", ...routePaths]);
  }
  assert.equal(spans.filter((span) => span.attributes["http.response.status_code"] === 404).length, 1, "the 404 probe's own span");
});

test("exportSite: a route that renders 500 is an ERROR span carrying the status, and the export still reports it", async (t) => {
  const { deps, exporter } = tracedDeps((req, res) => {
    res.statusCode = req.url?.includes("tovu-export-404-check") ? 404 : 500;
    res.end("<!doctype html><html><body>boom</body></html>");
  });

  const report = await exportSite({ routeDeps: deps, outputDir: makeOutputDir(t) });

  assert.ok(report.routes.failed.length > 0);
  const failedSpans = exporter.getFinishedSpans().filter((span) => span.attributes["http.response.status_code"] === 500);
  assert.ok(failedSpans.length > 0);
  for (const span of failedSpans) assert.equal(span.status.code, SpanStatusCode.ERROR);
});

test("exportSite: a fetch that fails in transport ends its span as ERROR with the error type, and the route is a failure, not a crash", async (t) => {
  const { deps, exporter } = tracedDeps((req) => { req.socket.destroy(); });

  const report = await exportSite({ routeDeps: deps, outputDir: makeOutputDir(t) });

  assert.equal(report.routes.succeeded.length, 0);
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, report.routes.failed.length);
  for (const span of spans) {
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.equal(typeof span.attributes["error.type"], "string");
    assert.equal(span.attributes["http.response.status_code"], undefined);
  }
});
