import { InMemoryPublishHistoryStore, listPublishDestinations } from "../../static-publish/publish-history.js";
import { loadBundledDeployTargets } from "../../deploy-targets/__tests__/bundled-deploy-targets.fixture.js";
import assert from "node:assert/strict";
import test from "node:test";
import { runDeploy, runDeployOps } from "../run-ops.js";
import { buildDeployOpsRegistrations } from "../tool-registrations.js";
import type { DeployOpsContext, DeployOpsDeployInput, DeployOpsDeployResult } from "../types.js";
import { fixture, execution } from "./example-ops-fixture.js";

type Deploy = (ctx: DeployOpsContext, input: DeployOpsDeployInput) => Promise<DeployOpsDeployResult>;
/** Replace the example-host fixture module's deploy with a fake while keeping its real descriptor's host list. */
async function withDeploy(deploy: Deploy | undefined) {
  const f = await fixture();
  const loaded = f.registry.get("example-host")!;
  const platform = { ...loaded, module: { ...loaded.module, ...(deploy ? { deploy } : {}) } };
  const registry = { ...f.registry, get: (id: string) => (id === "example-host" ? platform : f.registry.get(id)), list: () => [platform, f.registry.get("example-pipeline")!] };
  f.deps.loadDeployOps = async () => registry;
  f.deps.deployOpsRegistry = registry;
  return f;
}
const accepted = (extra: Partial<DeployOpsDeployResult> = {}): DeployOpsDeployResult => ({ platform: "spoofed", target: "spoofed", started: true, summary: "accepted", ...extra });

test("send is a bound, audited JSON write through the resolved credential", async () => {
  const f = await withDeploy(async (ctx, input) => {
    const response = await ctx.send({ method: "POST", url: "https://api.example-host.dev/v1/targets/shop/instances/m1", body: { ref: input.ref } });
    assert.equal(response.status, 200);
    return accepted({ runId: "42", machineIds: ["m1"] });
  });
  f.setResponse({ status: 200, headers: {}, bodyText: "{}" });
  assert.deepEqual(await runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop", ref: "main" } }), { platform: "example-host", target: "shop", started: true, summary: "accepted", runId: "42", machineIds: ["m1"] });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, "POST");
  assert.equal(f.calls[0].url, "https://api.example-host.dev/v1/targets/shop/instances/m1");
  assert.equal(f.calls[0].body, JSON.stringify({ ref: "main" }));
  assert.equal(f.calls[0].headers["content-type"], "application/json");
  assert.deepEqual(f.audit.entries.map(e => ({ label: e.label, host: e.host, method: e.method, status: e.status })), [{ label: "ops", host: "api.example-host.dev", method: "POST", status: 200 }]);
});

test("send refuses hosts outside the platform, credential-host mismatches and non-write methods before transport", async () => {
  const f = await withDeploy(async ctx => { await ctx.send({ method: "POST", url: "https://evil.test/hook", body: {} }); return accepted(); });
  await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: "Deployment ops platform 'example-host' does not allow host 'evil.test'." });
  const plain = await withDeploy(async ctx => { await ctx.send({ method: "POST", url: "http://api.example-host.dev/v1/targets", body: {} }); return accepted(); });
  await assert.rejects(runDeploy({ deps: plain.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: "Deployment ops platform 'example-host' does not allow host 'api.example-host.dev'." });
  const method = await withDeploy(async ctx => { await ctx.send({ method: "DELETE" as "POST", url: "https://api.example-host.dev/v1/targets/shop", body: {} }); return accepted(); });
  await assert.rejects(runDeploy({ deps: method.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: "Deployment ops module supplied unsupported method 'DELETE'." });
  const narrowed = await withDeploy(async ctx => { await ctx.send({ method: "POST", url: "https://logs.example-host.dev/v1/ingest", body: {} }); return accepted(); });
  const { InMemoryCustomCredentialSetRepo } = await import("../../../custom-credentials/repo.memory.js");
  const { createCustomCredential } = await import("../../../custom-credentials/store.js");
  const { InMemoryKeyring } = await import("../../../webhooks/keyring.memory.js");
  const { AesGcmSecretSealer } = await import("../../../webhooks/secret-sealer.aesgcm.js");
  const repo = new InMemoryCustomCredentialSetRepo(); const keyring = new InMemoryKeyring(); const sealer = new AesGcmSecretSealer(keyring);
  await createCustomCredential({ repo, keyring, sealer, clock: narrowed.deps.clock, idGen: { newId: () => "1" } }, { workspaceId: "ws", label: "ops", category: "ops", baseUrl: "https://api.example-host.dev", additionalHosts: [], connection: { token: "saved-private-token" } });
  await assert.rejects(runDeploy({ deps: { ...narrowed.deps, customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer }, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: "Credential 'ops' does not allow host 'logs.example-host.dev'. Add that host to the saved credential or choose another credentialLabel." });
  assert.deepEqual([...f.calls, ...plain.calls, ...method.calls, ...narrowed.calls], []);
});

test("write redirects and HTTP failures are refused, not followed", async () => {
  for (const status of [302, 422]) {
    const f = await withDeploy(async ctx => { await ctx.send({ method: "POST", url: "https://api.example-host.dev/v1/targets/shop/instances/m1", body: {} }); return accepted(); });
    f.setResponse({ status, headers: { location: "https://different-host.test/" }, bodyText: "vendor body" });
    await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: `Deployment ops host 'api.example-host.dev' returned HTTP ${status}. Check the target and retry; redirects are not followed.` });
    assert.equal(f.calls.length, 1);
  }
});

test("a dropped write connection warns that the deploy may have started", async () => {
  const f = await withDeploy(async ctx => { await ctx.send({ method: "POST", url: "https://api.example-host.dev/v1/targets/shop/instances/m1", body: {} }); return accepted(); });
  f.deps.deployOpsHttpClient = { send: async (): Promise<never> => { throw new Error("socket hang up"); } };
  await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), (error: Error) => {
    assert.equal(error.name, "ToolInputError");
    assert.equal(error.message, "Lost the connection to deployment ops host 'api.example-host.dev' during a POST; it may or may not have been accepted. Check deployment_ops_status before retrying.");
    return true;
  });
});

test("observe-only and unknown platforms are refused before any credential or HTTP work", async () => {
  const f = await withDeploy(undefined);
  await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message: "Deployment ops platform 'example-host' cannot deploy; it is observe-only. Platforms that can deploy: example-pipeline." });
  await assert.rejects(runDeploy({ deps: f.deps, input: { platform: "missing", target: "shop" } }), { name: "ToolInputError", message: "Unknown deployment ops platform 'missing'. Choose: example-host, example-pipeline." });
  assert.deepEqual(f.calls, []);
});

test("module results are normalized: platform/target from the request, invalid run ids and results refused", async () => {
  const f = await withDeploy(async () => accepted({ runId: "7", url: "javascript:alert(1)", sha: "a".repeat(40), extra: "dropped" } as Partial<DeployOpsDeployResult>));
  assert.deepEqual(await runDeploy({ deps: f.deps, input: { platform: "example-host", target: "shop" } }), { platform: "example-host", target: "shop", started: true, summary: "accepted", runId: "7", sha: "a".repeat(40) });
  for (const [result, message] of [
    [accepted({ runId: "7; rm" }), "Deployment ops platform 'example-host' returned an invalid run id."],
    [{ ...accepted(), started: "invalid" }, "Deployment ops platform 'example-host' returned an invalid deploy result."],
  ] as const) {
    const bad = await withDeploy(async () => result as DeployOpsDeployResult);
    await assert.rejects(runDeploy({ deps: bad.deps, input: { platform: "example-host", target: "shop" } }), { name: "ToolInputError", message });
  }
});

test("the chat tool requires write permission, validates input and calls runDeploy with the ref", async () => {
  let received: DeployOpsDeployInput | undefined;
  const f = await withDeploy(async (_ctx, input) => { received = input; return accepted({ runId: "9" }); });
  const tool = buildDeployOpsRegistrations(f.deps).find(r => r.descriptor.id === "deployment_ops_deploy")!;
  assert.equal(tool.descriptor.readOnly, false);
  const schema = tool.descriptor.inputSchema as any;
  assert.deepEqual(Object.keys(schema.properties), ["platform", "target", "ref", "workflowFile", "credentialLabel"]);
  assert.deepEqual(schema.required, ["platform", "target"]);
  assert.deepEqual(await tool.handler(execution({ platform: "example-host", target: "shop", ref: "v1.2.3" })), { platform: "example-host", target: "shop", started: true, summary: "accepted", runId: "9" });
  assert.deepEqual(received, { target: "shop", ref: "v1.2.3" });
  await assert.rejects(tool.handler(execution({ platform: "example-host", target: "shop", image: "x" })), { name: "ToolInputError", message: "Unexpected deployment ops input 'image'." });
  await assert.rejects(tool.handler(execution({ platform: "example-host", target: "shop", ref: "" })), { name: "ToolInputError", message: "ref must be a non-empty string of at most 200 characters." });
  const denied = buildDeployOpsRegistrations({ ...f.deps, authorize: async ({ permission }: { permission: string }) => ({ allowed: permission !== "custom-credentials.write", reason: "denied" }) } as typeof f.deps).find(r => r.descriptor.id === "deployment_ops_deploy")!;
  await assert.rejects(denied.handler(execution({ platform: "example-host", target: "shop" })), { message: "principal 'principal' is not authorized for 'custom-credentials.write' (denied)" });
});


test("a throwing history store preserves an accepted deploy and logs no error payload", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const store = new InMemoryPublishHistoryStore();
  store.recordSuccess = async () => { throw new Error("database parameters: PRIVATE_TOKEN"); };
  let deploys = 0;
  const f = await withDeploy(async () => { deploys++; return accepted({ runId: "42" }); });
  assert.deepEqual(await runDeploy({ deps: { ...f.deps, publishHistoryStore: store }, input: { platform: "example-host", target: "shop" } }),
    { platform: "example-host", target: "shop", started: true, summary: "accepted", runId: "42" });
  assert.equal(deploys, 1);
  assert.deepEqual(warnings, [["[deploy-ops] destination history write failed after accepted deploy"]]);
});

test("accepted deploys append descriptor identity to the shared ledger and link only matching saved peers", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  const f = await withDeploy(async () => accepted({ url: "https://live.example.test/", runId: "42" }));
  await runDeploy({ deps: { ...f.deps, publishHistoryStore: historyStore }, input: { platform: "example-host", target: "shop" } });
  const [recorded] = await historyStore.list({ workspaceId: "ws" });
  assert.equal(recorded?.kind, "deploy");
  assert.equal(recorded?.target, f.registry.get("example-host")!.descriptor.id);
  assert.equal(recorded?.projectName, "shop");
  assert.equal(recorded?.reachable, false);
  assert.equal(recorded?.status, "started");
  const registry = await loadBundledDeployTargets();
  const peers = [{ id: "saved-peer", label: "Live", baseUrl: "https://live.example.test" }];
  const [destination] = await listPublishDestinations({ workspaceId: "ws", historyStore, registry, peers });
  assert.deepEqual(destination, { id: "deploy:example-host:shop", kind: "deploy", target: "example-host", label: "shop",
    status: "started", statusMessage: "Deploy started, not confirmed",
    url: "https://live.example.test/", lastPublishedAt: recorded!.publishedAt, linkedPeerId: "saved-peer" });
  const [unlinked] = await listPublishDestinations({ workspaceId: "ws", historyStore, registry, peers: [] });
  assert.equal(unlinked?.kind === "deploy" && "linkedPeerId" in unlinked, false);
  assert.deepEqual(await listPublishDestinations({ workspaceId: "foreign", historyStore, registry, peers }), []);
  const failed = await withDeploy(async () => { throw new Error("deploy failed"); });
  await assert.rejects(runDeploy({ deps: { ...failed.deps, publishHistoryStore: historyStore }, input: { platform: "example-host", target: "other" } }));
  assert.equal((await historyStore.list({ workspaceId: "ws" })).length, 1);
});

test("an accepted deploy followed by failing status never becomes a confirmed destination", async () => {
  const historyStore = new InMemoryPublishHistoryStore();
  const f = await withDeploy(async () => accepted({ url: "https://failed.example.test", runId: "42" }));
  const platform = f.deps.deployOpsRegistry!.get("example-host")!;
  platform.module.status = async () => ({ platform: "example-host", target: "shop", state: "failing",
    summary: "Deploy failed", items: [], checkedAt: "2026-10-18T00:00:00Z" });
  const deps = { ...f.deps, publishHistoryStore: historyStore };
  await runDeploy({ deps, input: { platform: "example-host", target: "shop" } });
  assert.equal((await runDeployOps(deps, { platform: "example-host", target: "shop", runId: "42" }, "status")).state, "failing");
  const destinations = await listPublishDestinations({ workspaceId: "ws", historyStore,
    registry: await loadBundledDeployTargets(), peers: [] });
  assert.equal(destinations.length, 1);
  assert.equal(destinations[0]!.kind === "deploy" && destinations[0]!.status, "started");
  assert.equal((await historyStore.list({ workspaceId: "ws" }))[0]!.reachable, false);
});

test("the chat tool forwards an explicit credential label and omits an absent ref", async () => {
  let received: DeployOpsDeployInput | undefined;
  const f = await withDeploy(async (_ctx, input) => { received = input; return accepted({ runId: "10" }); });
  const tool = buildDeployOpsRegistrations(f.deps).find(r => r.descriptor.id === "deployment_ops_deploy")!;
  assert.deepEqual(await tool.handler(execution({ platform: "example-host", target: "shop", credentialLabel: "ops" })), { platform: "example-host", target: "shop", started: true, summary: "accepted", runId: "10" });
  assert.deepEqual(received, { target: "shop" });
});

test("the host forwards declared workflow data while absent hints remain absent", async () => {
  for (const workflowFile of [undefined, "example-pipeline.yml"]) {
    const f = await withDeploy(async (_ctx, input) => {
      assert.deepEqual(input, { target: "shop", ref: "main", ...(workflowFile === undefined ? {} : { workflowFiles: [workflowFile] }) });
      return accepted();
    });
    await runDeploy({ deps: { ...f.deps, loadDeployWorkflowFiles: workflowFile === undefined ? undefined : async () => [workflowFile] }, input: { platform: "example-host", target: "shop", ref: "main" } });
  }
});

test('safe workflow refusal returns started false and never records a successful dispatch', async () => {
  const f = await withDeploy(async () => ({ platform: 'example-host', target: 'shop', started: false, summary: 'Choose a workflow; nothing dispatched.' }));
  let records = 0;
  const deps = { ...f.deps, publishHistoryStore: { recordSuccess: async () => { records++; } } as never };
  const result = await runDeploy({ deps, input: { platform: 'example-host', target: 'shop' } });
  assert.equal(result.started, false);
  assert.equal(records, 0);
  assert.deepEqual(f.calls, []);
});
