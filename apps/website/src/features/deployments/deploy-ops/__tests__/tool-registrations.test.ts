import assert from "node:assert/strict";
import test from "node:test";
import { buildDeployOpsRegistrations } from "../tool-registrations.js";
import { waitForDeployOps } from "../run-ops.js";
import { fixture, execution } from "./ops-fixture.js";
import { AT } from "./module-fixture.js";
test("five read-only tools, the deploy tool and the two secret writers are wired with platform enum from registry", async () => {
  const f = await fixture();
  const registrations = buildDeployOpsRegistrations(f.deps);
  assert.deepEqual(registrations.map(r => ({ id: r.descriptor.id, readOnly: r.descriptor.readOnly })), [
    { id: "deployment_ops_status", readOnly: true }, { id: "deployment_ops_logs", readOnly: true }, { id: "deployment_ops_wait", readOnly: true }, { id: "deployment_ops_list_targets", readOnly: true }, { id: "deployment_ops_deploy", readOnly: false },
    { id: "deployment_ops_list_secrets", readOnly: true }, { id: "deployment_ops_set_secret", readOnly: false }, { id: "deployment_ops_unset_secret", readOnly: false },
  ]);
  const secretTools = ["deployment_ops_list_secrets", "deployment_ops_set_secret", "deployment_ops_unset_secret"];
  for (const r of registrations) assert.deepEqual((r.descriptor.inputSchema as any).properties.platform.enum, secretTools.includes(r.descriptor.id) ? ["fly"] : ["fly", "github-actions"]);
});
test("secret tools advertise only platforms whose loaded adapter implements secrets", async () => {
  const f = await fixture();
  const tools = new Map(buildDeployOpsRegistrations(f.deps).map(r => [r.descriptor.id, r.descriptor]));
  for (const id of ["deployment_ops_list_secrets", "deployment_ops_set_secret", "deployment_ops_unset_secret"]) {
    assert.match(tools.get(id)!.description, / Platforms: fly \(Fly\.io\)\.$/);
    assert.doesNotMatch(tools.get(id)!.description, /github-actions|GitHub Actions/);
  }
  assert.match(tools.get("deployment_ops_status")!.description, /Platforms: fly \(Fly\.io\), github-actions \(GitHub Actions\)\./);
  const observeOnly = { ...f.registry, list: () => f.registry.list().filter(p => p.descriptor.id === "github-actions") };
  const listSecrets = buildDeployOpsRegistrations({ ...f.deps, deployOpsRegistry: observeOnly }).find(r => r.descriptor.id === "deployment_ops_list_secrets")!.descriptor;
  assert.deepEqual((listSecrets.inputSchema as any).properties.platform.enum, []);
  assert.match(listSecrets.description, / Platforms: none available\.$/);
});
test("schemas follow a narrowed or empty loaded registry rather than bundled platform ids", async () => {
  const f = await fixture();
  const platform = { ...f.registry.get("fly")!, descriptor: { ...f.registry.get("fly")!.descriptor, id: "example", label: "Example" } };
  for (const platforms of [[platform], []]) {
    const registry = { ...f.registry, list: () => platforms };
    for (const r of buildDeployOpsRegistrations({ ...f.deps, deployOpsRegistry: registry })) {
      assert.deepEqual((r.descriptor.inputSchema as any).properties.platform.enum, platforms.length ? ["example"] : []);
    }
  }
});
test("every tool denies permission before registry or credential requests", async () => {
  const f = await fixture();
  let reads = 0;
  const deps = { ...f.deps, authorize: async () => ({ allowed: false, reason: "denied" }), loadDeployOps: async () => { reads++; return f.registry; } };
  for (const r of buildDeployOpsRegistrations(deps)) await assert.rejects(r.handler(execution({ platform: "fly", target: "shop", until: "healthy" })), { message: `principal 'principal' is not authorized for '${["deployment_ops_deploy", "deployment_ops_set_secret", "deployment_ops_unset_secret"].includes(r.descriptor.id) ? "custom-credentials.write" : "custom-credentials.read"}' (denied)` });
  assert.deepEqual(f.calls, []); assert.equal(reads, 0);
});
test("handlers exercise status, logs and targets; invalid limits and timeouts are refused", async () => {
  const f = await fixture(); const tools = new Map(buildDeployOpsRegistrations(f.deps).map(r => [r.descriptor.id, r]));
  assert.deepEqual(await tools.get("deployment_ops_status")!.handler(execution({ platform: "fly", target: "shop" })), { platform: "fly", target: "shop", state: "stopped", summary: "0 machines: stopped", items: [], checkedAt: AT });
  assert.deepEqual(await tools.get("deployment_ops_logs")!.handler(execution({ platform: "fly", target: "shop" })), { platform: "fly", target: "shop", lines: [], truncated: false });
  assert.deepEqual(await tools.get("deployment_ops_list_targets")!.handler(execution({ platform: "fly" })), { platform: "fly", targets: [] });
  for (const limit of [0, 501, 1.5, "2"]) await assert.rejects(tools.get("deployment_ops_logs")!.handler(execution({ platform: "fly", target: "shop", limit })), { message: "limit must be an integer from 1 to 500." });
  for (const timeoutSeconds of [9, 301, 10.5, "10"]) await assert.rejects(tools.get("deployment_ops_wait")!.handler(execution({ platform: "fly", target: "shop", until: "healthy", timeoutSeconds })), { message: "timeoutSeconds must be an integer from 10 to 300." });
});
test("unsupported listing, unknown platforms and invalid handler input refuse before HTTP", async () => {
  const f = await fixture();
  const tools = new Map(buildDeployOpsRegistrations(f.deps).map(r => [r.descriptor.id, r]));
  for (const [id, input, message] of [
    ["deployment_ops_list_targets", { platform: "github-actions" }, "Deployment ops platform 'github-actions' does not support listing targets. Supply a target for deployment_ops_status."],
    ["deployment_ops_status", { platform: "missing", target: "shop" }, "Unknown deployment ops platform 'missing'. Choose: fly, github-actions."],
    ["deployment_ops_logs", { platform: "fly", target: "" }, "target must be a non-empty string of at most 200 characters."],
    ["deployment_ops_status", { platform: "fly", target: "shop", method: "POST" }, "Unexpected deployment ops input 'method'."],
    ["deployment_ops_wait", { platform: "fly", target: "shop", until: "ready" }, "until must be 'healthy' or 'finished'."],
  ] as const) {
    await assert.rejects(tools.get(id)!.handler(execution(input)), { name: "ToolInputError", message });
  }
  assert.deepEqual(f.calls, []);
});
function fakeClock() { let now = 0; const sleeps: number[] = []; return { sleeps, now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms; } }; }
const status = (state: string) => ({ platform: "example", target: "shop", state, summary: state, items: [], checkedAt: AT });
test("wait reaches healthy on poll three with exact result and sleeps", async () => {
  const clock = fakeClock(); let polls = 0;
  assert.deepEqual(await waitForDeployOps({ status: async () => status(++polls === 3 ? "healthy" : "deploying") as any, clock }, { until: "healthy", timeoutSeconds: 25 }), { reached: true, waitedSeconds: 20, polls: 3, last: status("healthy") });
  assert.deepEqual(clock.sleeps, [10000, 10000]);
});
test("timeout returns false and never sleeps beyond its deadline; unknown is not finished", async () => {
  const clock = fakeClock();
  assert.deepEqual(await waitForDeployOps({ status: async () => status("unknown") as any, clock }, { until: "finished", timeoutSeconds: 25 }), { reached: false, waitedSeconds: 25, polls: 3, last: status("unknown") });
  assert.deepEqual(clock.sleeps, [10000, 10000, 5000]);
});
for (const state of ["healthy", "failing", "stopped"]) test(`finished recognizes terminal ${state}`, async () => {
  assert.deepEqual(await waitForDeployOps({ status: async () => status(state) as any, clock: fakeClock() }, { until: "finished", timeoutSeconds: 10 }), { reached: true, waitedSeconds: 0, polls: 1, last: status(state) });
});
test("abort stops waiting without another poll; already aborted calls never request", async () => {
  const controller = new AbortController(); let polls = 0;
  const clock = { now: () => 0, sleep: async () => { controller.abort(); } };
  await assert.rejects(waitForDeployOps({ status: async () => { polls++; return status("deploying") as any; }, clock }, { until: "healthy", timeoutSeconds: 10, signal: controller.signal }), { name: "ToolInputError", message: "Deployment ops wait was aborted." });
  assert.equal(polls, 1);
  const f = await fixture();
  await assert.rejects(buildDeployOpsRegistrations(f.deps)[2]!.handler(execution({ platform: "fly", target: "shop", until: "healthy" }, controller.signal)), { name: "ToolInputError", message: "Deployment ops wait was aborted." });
  assert.deepEqual(f.calls, []);
});
test("wait cancels an in-flight poll promptly and starts no later requests", async () => {
  const controller = new AbortController();
  let received: AbortSignal | undefined; let polls = 0;
  const waiting = waitForDeployOps({ status: async signal => { received = signal; polls++; controller.abort(); return new Promise(() => {}); }, clock: fakeClock() }, { until: "healthy", timeoutSeconds: 10, signal: controller.signal });
  await assert.rejects(waiting, { name: "ToolInputError", message: "Deployment ops wait was aborted." });
  assert.equal(received!.aborted, true); assert.equal(polls, 1);
});
test("handler wait propagates signal, default poll interval, and returns actual observations", async () => {
  const f = await fixture(); let calls = 0; const clock = fakeClock();
  f.deps.deployOpsHttpClient = { send: async (request: any) => { f.calls.push(request); calls++; return { status: 200, headers: {}, bodyText: JSON.stringify([{ id: "m1", state: calls === 3 ? "started" : "starting", checks: [] }]) }; } };
  const deps = { ...f.deps, waitClock: clock };
  const result = await buildDeployOpsRegistrations(deps)[2]!.handler(execution({ platform: "fly", target: "shop", until: "healthy", timeoutSeconds: 25 }));
  assert.deepEqual(result, { reached: true, waitedSeconds: 20, polls: 3, last: { platform: "fly", target: "shop", state: "healthy", summary: "1 machines: healthy", items: [{ id: "m1", state: "started", detail: "region=; image=; checks=; updated_at=" }], checkedAt: AT } });
  assert.deepEqual(clock.sleeps, [10000, 10000]); assert.equal(f.audit.entries.length, 3);
});
test("a stalled first poll still returns a timeout result at the deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0; let received: AbortSignal | undefined;
  const initial = { ...status("unknown"), summary: "No status received before timeout." } as any;
  const waiting = waitForDeployOps({ initial, clock: { now: () => now, sleep: async () => { throw new Error("unexpected sleep"); } }, status: async signal => { received = signal; return new Promise(() => {}); } }, { until: "healthy", timeoutSeconds: 10 });
  now = 10000; t.mock.timers.tick(10000);
  assert.deepEqual(await waiting, { reached: false, waitedSeconds: 10, polls: 1, last: { platform: "example", target: "shop", state: "unknown", summary: "No status received before timeout.", items: [], checkedAt: AT } });
  assert.equal(received!.aborted, true);
});

test('missing deploy credential is returned as a card diagnostic before HTTP', async () => {
  const f = await fixture([]);
  const status = buildDeployOpsRegistrations(f.deps).find(r => r.descriptor.id === 'deployment_ops_status')!;
  const result = await status.handler(execution({ platform: 'fly', target: 'shop' })) as { credentialSetup: unknown };
  assert.deepEqual(result.credentialSetup, {
    setupToolId: 'credential_save', remedyToolId: 'credential_save', prefill: { kind: 'api', label: 'fly', baseUrl: 'https://api.machines.dev', category: 'ops' },
    hint: 'A missing or rejected credential may be fixed by saving it through the secure card.',
  });
  assert.deepEqual(f.calls, []);
});
