import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { boundContext, runDeploy, runDeployOps, MAX_RESPONSE_CHARS } from "../run-ops.js";
import { fixture } from "./example-ops-fixture.js";
import { AT } from "./module-fixture.js";

test("T20: bodyless POST and DELETE omit content-type while JSON writes retain it", async () => {
  const f = await fixture();
  const ctx = await boundContext(f.deps, f.registry.get("example-host")!, "ops", undefined, { allowDelete: true });
  const url = "https://api.example-host.dev/v1/targets/shop/secrets/OLD_KEY";
  await ctx.send({ method: "POST", url });
  await ctx.send({ method: "DELETE", url });
  await ctx.send({ method: "POST", url, body: { value: "replacement" } });

  assert.deepEqual(f.calls.map(request => ({
    method: request.method,
    url: request.url,
    body: request.body,
    contentType: new Headers(request.headers).get("content-type"),
  })), [
    { method: "POST", url, body: undefined, contentType: null },
    { method: "DELETE", url, body: undefined, contentType: null },
    { method: "POST", url, body: '{"value":"replacement"}', contentType: "application/json" },
  ]);
});

for (const runId of ["dep-abc123", "550e8400-e29b-41d4-a716-446655440000", "42", "A" + "_".repeat(127)]) {
  test(`deploy result preserves bounded run ID ${runId}`, async () => {
    const f = await fixture();
    const loaded = f.registry.get("example-host")!;
    const platform = { ...loaded, module: { ...loaded.module, deploy: async () => ({ platform: "example-host", target: "shop", started: true, summary: "Accepted", runId }) } };
    f.deps.loadDeployOps = async () => ({ ...f.registry, get: () => platform });
    const result = await runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } });
    assert.equal(result.runId, runId);
    assert.equal(result.started, true);
  });
}

for (const runId of ["../x", "a/b", "a".repeat(129), "", "_abc", "-abc"]) {
  test(`deploy result refuses invalid run ID ${JSON.stringify(runId)}`, async () => {
    const f = await fixture();
    const loaded = f.registry.get("example-host")!;
    const platform = { ...loaded, module: { ...loaded.module, deploy: async () => ({ platform: "example-host", target: "shop", started: true, summary: "Accepted", runId }) } };
    f.deps.loadDeployOps = async () => ({ ...f.registry, get: () => platform });
    await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), {
      name: "ToolInputError", message: "Deployment ops platform 'example-host' returned an invalid run id.",
    });
  });
}

test("explicit and single-host credential resolution issue only audited GETs", async () => {
  for (const credentialLabel of [undefined, "ops"]) {
    const f = await fixture();
    assert.deepEqual(await runDeployOps(f.deps, { platform: "example-host", target: "shop", credentialLabel }, "status"), { platform: "example-host", target: "shop", state: "unknown", summary: "0 instances: unknown", items: [], checkedAt: AT });
    assert.deepEqual(f.calls.map(c => ({ method: c.method, url: c.url })), [{ method: "GET", url: "https://api.example-host.dev/v1/targets/shop/instances" }]);
    assert.deepEqual(f.audit.entries, [{ label: "ops", host: "api.example-host.dev", method: "GET", status: 200, bodyBytes: 0, at: AT }]);
  }
});
test("zero, multiple, and missing explicit labels give exact actionable refusals", async () => {
  for (const [labels, credentialLabel, message] of [
    [[], undefined, "No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once."],
    [["z", "a"], undefined, "Several saved custom credentials match 'api.example-host.dev'. Set credentialLabel to one of: a, z."],
    [["ops"], "absent", "No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once."],
  ] as const) {
    const f = await fixture({ labels: [...labels] });
    await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop", credentialLabel }, "status"), { name: "ToolInputError", message });
    assert.deepEqual(f.calls, []);
  }
});
test("saved-host refusal occurs before transport, even with an explicit credential", async () => {
  const f = await fixture({ labels: ["ops"], host: "https://elsewhere.test", additionalHosts: [] });
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop", credentialLabel: "ops" }, "status"), { name: "ToolInputError", message: "Credential 'ops' does not allow host 'api.example-host.dev'. Add that host to the saved credential or choose another credentialLabel." });
  assert.deepEqual(f.calls, []);
});
for (const status of [401, 403]) test(`${status} identifies credential and verify remedy`, async () => {
  const f = await fixture(); f.setResponse({ status, headers: {}, bodyText: "private vendor error" });
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status"), { name: "ToolInputError", message: `Credential 'ops' was rejected (HTTP ${status}). Run custom_credential_verify with label 'ops' and check its saved token/scopes.` });
});
test("response cap and platform host gate apply even to a trusted module", async () => {
  const f = await fixture(); f.setResponse({ status: 200, headers: {}, bodyText: "x".repeat(MAX_RESPONSE_CHARS + 1) });
  const loaded = f.registry.get("example-host")!;
  f.deps.loadDeployOps = async () => ({ ...f.registry, get: () => ({ ...loaded, module: { ...loaded.module, status: async (ctx: any) => { const response = await ctx.get("https://api.example-host.dev/v1/targets"); assert.equal(response.text.length, MAX_RESPONSE_CHARS); assert.equal(response.truncated, true); return { platform: "example-host", target: "shop", state: "unknown", summary: "capped", items: [], checkedAt: AT }; } } }) });
  assert.equal((await runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status")).summary, "capped");
  f.deps.loadDeployOps = async () => ({ ...f.registry, get: () => ({ ...loaded, module: { ...loaded.module, status: async (ctx: any) => ctx.get("https://evil.test/") } }) });
  const before = f.calls.length;
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status"), ToolInputError);
  assert.equal(f.calls.length, before);
});
test("redirects and HTTP failures refuse without exposing raw bodies", async () => {
  for (const status of [302, 404, 500]) {
    const f = await fixture(); f.setResponse({ status, headers: { location: "https://different-host.test/archive" }, bodyText: "secret vendor error" });
    await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status"), { message: `Deployment ops host 'api.example-host.dev' returned HTTP ${status}. Check the target and retry; redirects are not followed.` });
    assert.equal(f.calls.length, 1);
  }
});
test("saved credential includes secondary hosts, tokens are redacted before module receives text", async () => {
  const f = await fixture(); f.setResponse({ status: 200, headers: {}, bodyText: "saved-private-token leaked" });
  const loaded = f.registry.get("example-host")!;
  let received = "";
  f.deps.loadDeployOps = async () => ({ ...f.registry, get: () => ({ ...loaded, module: { ...loaded.module, logs: async (ctx: any) => { received = (await ctx.get("https://logs.example-host.dev/v1/targets/shop/logs")).text; return { platform: "example-host", target: "shop", lines: [{ message: received }], truncated: false }; } } }) });
  await runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "logs");
  assert.equal(received, "[REDACTED] leaked");
  assert.equal(f.calls[0].url, "https://logs.example-host.dev/v1/targets/shop/logs");
});
test("transport clipping is reported as truncated even below the runner text cap", async () => {
  const f = await fixture();
  f.deps.deployOpsHttpClient = { send: async (request: any) => { f.calls.push(request); return { status: 200, headers: {}, bodyText: "partial log", bodyTruncated: true }; } };
  const result = await runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "logs");
  assert.equal(result.truncated, true);
});
test("dedicated no-redirect HTTP client is required and used instead of the raw credential client", async () => {
  const f = await fixture();
  const deps = { ...f.deps, deployOpsHttpClient: f.deps.customCredentialsHttpClient, customCredentialsHttpClient: { send: async (): Promise<never> => { throw new Error("wrong HTTP client"); } } };
  assert.equal((await runDeployOps(deps, { platform: "example-host", target: "shop" }, "status")).state, "unknown");
  await assert.rejects(runDeployOps({ ...deps, deployOpsHttpClient: undefined }, { platform: "example-host", target: "shop" }, "status"), { name: "ToolInputError", message: "Deployment ops HTTP client is unavailable. Restart the site to rebuild its tool dependencies." });
  assert.equal(f.calls.length, 1);
});
test("egress refusals are model-visible without leaking raw transport details", async () => {
  const { EgressRefusedError } = await import("../../../../platform/http/index.js");
  const f = await fixture();
  f.deps.deployOpsHttpClient = { send: async (): Promise<never> => { throw new EgressRefusedError({ message: "private address 127.0.0.1 refused" }); } };
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status"), { name: "ToolInputError", message: "Deployment ops host 'api.example-host.dev' was refused by outbound HTTP policy. Use a public HTTPS endpoint allowed by the saved credential." });
  assert.deepEqual(f.audit.entries, [{ label: "ops", host: "api.example-host.dev", method: "GET", status: 0, bodyBytes: 0, at: AT, egressRefusal: "private address 127.0.0.1 refused" }]);
});
test("cancellation reaches the HTTP transport and preserves an actionable abort refusal", async () => {
  const f = await fixture();
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  f.deps.deployOpsHttpClient = { send: async (request: any): Promise<never> => {
    f.calls.push(request);
    received = request.signal;
    controller.abort();
    throw new Error("transport aborted");
  } };
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status", controller.signal), {
    name: "ToolInputError", message: "Deployment ops wait was aborted.",
  });
  assert.equal(received, controller.signal);
  assert.equal(received!.aborted, true);
  assert.deepEqual(f.calls.map(c => ({ method: c.method, maxResponseBytes: c.maxResponseBytes })), [{ method: "GET", maxResponseBytes: 256_000 }]);
  assert.deepEqual(f.audit.entries, [{ label: "ops", host: "api.example-host.dev", method: "GET", status: 0, bodyBytes: 0, at: AT }]);
});
test("zero host matches list saved labels without sending a request", async () => {
  const f = await fixture({ labels: ["other"], host: "https://elsewhere.test", additionalHosts: [] });
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status"), {
    name: "ToolInputError", message: "No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once.",
  });
  assert.deepEqual(f.calls, []);
});
test("cancellation during auth scheme loading prevents the subsequent HTTP request", async () => {
  const f = await fixture();
  const controller = new AbortController();
  f.deps.loadAuthSchemes = async () => { controller.abort(); return []; };
  await assert.rejects(runDeployOps(f.deps, { platform: "example-host", target: "shop" }, "status", controller.signal), {
    name: "ToolInputError", message: "Deployment ops wait was aborted.",
  });
  assert.deepEqual(f.calls.map(c => c.url), []);
});
