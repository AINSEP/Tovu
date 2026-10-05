import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SpanStatusCode } from "@opentelemetry/api";
import type { DeployTarget } from "@jini-ai/devops/deploy";

import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import type { DeployTargetModule, DeployTargetRegistry } from "#src/features/deployments/deploy-targets/types";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { createRouteDeps } from "#src/server/runtime/composition/app";

import { publishStaticSite } from "../adapter.js";
import type { PublishCredentialSource } from "../types.js";
import { InMemoryPublishCredentialVerificationCache, verifyPublishCredential } from "../verify.js";

/**
 * @file The two static-publish entry points hand `deps.observability` to the kit they build by
 * default, so a credential check and a real plugin publish both export their deploy-host egress.
 * Real SDK with an in-memory exporter; transport is an injected `fetchFn` or a loopback server.
 */

const TOKEN = "pub-tok-91c2";
const clock = { nowIso: () => "2026-10-04T00:00:00.000Z" };
const source: PublishCredentialSource = {
  async resolve() { return { ok: true, token: TOKEN }; },
  async isConfigured() { return { configured: true }; },
};

test("a credential check through the default kit is one outbound span without the token", async () => {
  const { exporter, port } = createInMemoryOtel();
  const fetchFn = (async () => new Response(JSON.stringify({ login: "octo" }), { status: 200 })) as typeof fetch;
  const result = await verifyPublishCredential(
    { credentialSource: source, cache: new InMemoryPublishCredentialVerificationCache(), clock, fetchFn, observability: port, loadDeployTargets: loadBundledDeployTargets },
    { workspaceId: "ws-otel", target: "github-pages" },
  );
  assert.equal(result?.status, "valid");
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "GET api.github.com");
  assert.equal(span.attributes["http.response.status_code"], 200);
  assertSpanOmits(span, [TOKEN, "/user"]);
});

test("a plugin publish through the default kit exports its deploy call, with ERROR status on a rejected deploy", async () => {
  const server: Server = createServer((_req, res) => { res.statusCode = 422; res.end("bad"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-otel-"));
  try {
    const { exporter, port } = createInMemoryOtel();
    const deployUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sites/acme/deploys?token=${TOKEN}`;
    const module: DeployTargetModule = {
      create({ kit }) {
        return {
          id: "netlify",
          async publish() {
            const response = await kit.fetch(deployUrl, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } }, { timeoutMs: 2_000 });
            return { targetId: "netlify", url: "https://demo.netlify.app", status: response.ok ? "ready" : "failed" };
          },
          async checkReachability() { return { reachable: true }; },
        } satisfies DeployTarget;
      },
    };
    const registry: DeployTargetRegistry = {
      get: (id) => (id === "netlify" ? { descriptor: { id, label: id, module: "targets/netlify.mjs", configFields: [] }, pluginId: "deploy", module } : undefined),
      list: () => [],
      refusals: [],
    };
    const routeDeps = createRouteDeps();
    await publishStaticSite(
      { credentialSource: source, loadDeployTargets: async () => registry, observability: port },
      { workspaceId: routeDeps.workspaceId, publishOutputRootDir: outputDir, idGen: routeDeps.idGen, exportSiteBound: routeDeps.exportSiteBound, config: { target: "netlify" }, projectName: "demo" },
    );
    const [span] = exporter.getFinishedSpans();
    assert.equal(span.name, "POST 127.0.0.1");
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.equal(span.attributes["http.response.status_code"], 422);
    assertSpanOmits(span, [TOKEN, "acme"]);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
