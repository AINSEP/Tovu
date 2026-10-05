import assert from "node:assert/strict";
import type { RequestListener } from "node:http";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ToolExecutionContext } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { fetchPublishedPage } from "../published-page.js";
import { buildSiteInspectionRegistrations } from "../tool-registrations.js";

/**
 * @file `fetchPublishedPage`'s loopback render is one outbound CLIENT span through
 * `deps.observability`: method, host/port and status — never the page path or its query. The
 * `fetch_published_page` tool hands it its own `RouteDeps`, so the composition root's port reaches
 * it with no extra wiring. Real loopback server, real OTel SDK with an in-memory exporter.
 */

const PAGE = "/private-slug-91c?draft=tok-b2e";

function renderer(status: number): RequestListener {
  return (_req, res) => {
    res.statusCode = status;
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><html><body>page</body></html>");
  };
}

test("fetchPublishedPage traces the loopback render as one CLIENT span: host, port and status, never the path or query", async () => {
  const { exporter, port } = createInMemoryOtel();

  const result = await fetchPublishedPage({ createSiteApp: () => renderer(200), observability: port }, { path: PAGE });

  assert.equal(result.status, 200);
  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  const [span] = spans;
  assert.equal(span.name, "GET 127.0.0.1");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(typeof span.attributes["server.port"], "number");
  assert.equal(span.attributes["http.response.status_code"], 200);
  assert.equal(span.status.code, SpanStatusCode.UNSET);
  assertSpanOmits(span, ["private-slug-91c", "draft", "tok-b2e"]);
});

test("fetchPublishedPage: a 500 render is an ERROR span with the status, and still returned to the caller", async () => {
  const { exporter, port } = createInMemoryOtel();

  const result = await fetchPublishedPage({ createSiteApp: () => renderer(500), observability: port }, { path: "/" });

  assert.equal(result.status, 500);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["http.response.status_code"], 500);
});

test("fetchPublishedPage: a transport failure ends the span as ERROR with the error type and rethrows", async () => {
  const { exporter, port } = createInMemoryOtel();

  await assert.rejects(fetchPublishedPage({ createSiteApp: () => (req) => { req.socket.destroy(); }, observability: port }, { path: PAGE }));

  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(typeof span.attributes["error.type"], "string");
  assertSpanOmits(span, ["private-slug-91c", "tok-b2e"]);
});

test("fetchPublishedPage: with no port the render is untraced and unchanged", async () => {
  const result = await fetchPublishedPage({ createSiteApp: () => renderer(200) }, { path: "/" });
  assert.equal(result.status, 200);
  assert.equal(result.body, "<!doctype html><html><body>page</body></html>");
});

test("fetch_published_page: the tool's render is traced through its RouteDeps.observability", async () => {
  const { exporter, port } = createInMemoryOtel();
  const deps = createRouteDeps();
  await deps.identityReady;
  deps.observability = port;
  deps.createSiteApp = () => renderer(200);
  const handler = buildSiteInspectionRegistrations(deps).find((registration) => registration.descriptor.id === "fetch_published_page")!.handler;
  const ctx = {
    executionId: "exec-otel",
    principal: { id: await deps.ownerPrincipalId },
    run: { id: "run-otel" },
    input: { path: PAGE },
    signal: new AbortController().signal,
  } as unknown as ToolExecutionContext;

  await handler(ctx);

  const spans = exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.CLIENT);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].name, "GET 127.0.0.1");
  assertSpanOmits(spans[0], ["private-slug-91c", "tok-b2e"]);
});
