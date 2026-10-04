import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createObservabilityPort, resolveObservabilityConfig } from "../../index.js";

/** F2.4/F2.6: real enabled factory, default batch processor, and OTLP HTTP serializer.
 * Port test: run outside the sandbox. No SDK processor or exporter is replaced.
 */
test("enabled public factory exports a request through the default OTLP batch pipeline with its configured service identity", { timeout: 15_000 }, async (t) => {
  let receive!: (request: { method: string | undefined; url: string | undefined; contentType: string | undefined; body: string }) => void;
  const received = new Promise<Parameters<typeof receive>[0]>((resolve, reject) => {
    receive = resolve;
    t.signal.addEventListener("abort", () => reject(t.signal.reason), { once: true });
  });
  const originalCompression = process.env.OTEL_EXPORTER_OTLP_TRACES_COMPRESSION;
  process.env.OTEL_EXPORTER_OTLP_TRACES_COMPRESSION = "none";
  t.after(() => {
    if (originalCompression === undefined) delete process.env.OTEL_EXPORTER_OTLP_TRACES_COMPRESSION;
    else process.env.OTEL_EXPORTER_OTLP_TRACES_COMPRESSION = originalCompression;
  });
  const collector = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
    receive({ method: request.method, url: request.url, contentType: request.headers["content-type"], body });
  });
  t.after(() => {
    collector.closeAllConnections();
    return new Promise<void>((resolve, reject) => {
      collector.close((error) => error ? reject(error) : resolve());
    });
  });
  await new Promise<void>((resolve, reject) => {
    collector.once("error", reject);
    collector.listen(0, "127.0.0.1", resolve);
  });
  const address = collector.address();
  assert.ok(address && typeof address === "object");
  const config = resolveObservabilityConfig({ env: {
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${address.port}/configured-traces`,
    OTEL_SERVICE_NAME: "tovu-default-pipeline-test",
  } });
  assert.equal(config.enabled, true);
  const port = createObservabilityPort({ config });
  port.trackRequest({ method: "POST", path: "/posts/42" }).end({ statusCode: 201, routePattern: "/posts/:id" });

  const request = await received;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/configured-traces");
  assert.equal(request.contentType, "application/json");
  const payload = JSON.parse(request.body);
  assert.equal(payload.resourceSpans.length, 1);
  const [resourceSpans] = payload.resourceSpans;
  const service = resourceSpans.resource.attributes.find((attribute: { key: string }) => attribute.key === "service.name");
  assert.deepEqual(service.value, { stringValue: "tovu-default-pipeline-test" });
  assert.equal(resourceSpans.scopeSpans.length, 1);
  const [scope] = resourceSpans.scopeSpans;
  assert.equal(scope.scope.name, "tovu.observability");
  assert.equal(scope.spans.length, 1);
  const [span] = scope.spans;
  assert.equal(span.name, "POST /posts/:id");
  assert.equal(span.kind, 2); // OTLP SERVER
  const attributes = new Map(span.attributes.map((attribute: { key: string; value: { stringValue?: string; intValue?: string | number } }) => [attribute.key, attribute.value]));
  assert.deepEqual(attributes.get("http.method"), { stringValue: "POST" });
  assert.deepEqual(attributes.get("http.target"), { stringValue: "/posts/42" });
  assert.deepEqual(attributes.get("http.route"), { stringValue: "/posts/:id" });
  assert.equal(Number((attributes.get("http.status_code") as { intValue: string | number }).intValue), 201);
});
