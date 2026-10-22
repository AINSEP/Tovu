import assert from "node:assert/strict";
import test from "node:test";
import { buildDeployOpsRegistrations } from "../../../../../apps/website/src/features/deployments/deploy-ops/tool-registrations.ts";
import { fixture, execution, AT } from "./ops-fixture.mjs";

// Moved from core deploy-ops/__tests__/tool-registrations.test.ts, which now drives a neutral fixture:
// the values here are Fly's own output and manifest, seen through the generic tools and this package's registry.

test("the Fly package advertises one secrets-capable platform labelled Fly.io", async () => {
  const f = await fixture();
  const tools = new Map(buildDeployOpsRegistrations(f.deps).map(r => [r.descriptor.id, r.descriptor]));
  for (const id of ["deployment_ops_status", "deployment_ops_list_secrets", "deployment_ops_set_secret", "deployment_ops_unset_secret"]) {
    assert.deepEqual(tools.get(id).inputSchema.properties.platform.enum, ["fly"]);
    assert.match(tools.get(id).description, /Platforms: fly \(Fly\.io\)\./);
  }
});

test("status, logs and targets through the generic handlers return Fly's normalized empty results", async () => {
  const f = await fixture(); const tools = new Map(buildDeployOpsRegistrations(f.deps).map(r => [r.descriptor.id, r]));
  assert.deepEqual(await tools.get("deployment_ops_status").handler(execution({ platform: "fly", target: "shop" })), { platform: "fly", target: "shop", state: "stopped", summary: "0 machines: stopped", items: [], checkedAt: AT });
  assert.deepEqual(await tools.get("deployment_ops_logs").handler(execution({ platform: "fly", target: "shop" })), { platform: "fly", target: "shop", lines: [], truncated: false });
  assert.deepEqual(await tools.get("deployment_ops_list_targets").handler(execution({ platform: "fly" })), { platform: "fly", targets: [] });
  assert.deepEqual(f.calls.map(c => c.url), ["https://api.machines.dev/v1/apps/shop/machines", "https://api.fly.io/api/v1/apps/shop/logs", "https://api.machines.dev/v1/apps?org_slug=personal"]);
});

test("wait reports Fly machine observations until every started machine passes", async () => {
  const f = await fixture(); let calls = 0; let now = 0; const sleeps = [];
  f.deps.deployOpsHttpClient = { send: async (request) => { f.calls.push(request); calls++; return { status: 200, headers: {}, bodyText: JSON.stringify([{ id: "m1", state: calls === 3 ? "started" : "starting", checks: [] }]) }; } };
  const deps = { ...f.deps, waitClock: { now: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; } } };
  const result = await buildDeployOpsRegistrations(deps)[2].handler(execution({ platform: "fly", target: "shop", until: "healthy", timeoutSeconds: 25 }));
  assert.deepEqual(result, { reached: true, waitedSeconds: 20, polls: 3, last: { platform: "fly", target: "shop", state: "healthy", summary: "1 machines: healthy", items: [{ id: "m1", state: "started", detail: "region=; image=; checks=; updated_at=" }], checkedAt: AT } });
  assert.deepEqual(sleeps, [10000, 10000]);
});

test("a missing Fly credential prefills the secure card with Fly's API host", async () => {
  const f = await fixture({ labels: [] });
  const status = buildDeployOpsRegistrations(f.deps).find(r => r.descriptor.id === "deployment_ops_status");
  const result = await status.handler(execution({ platform: "fly", target: "shop" }));
  assert.deepEqual(result.credentialSetup, {
    setupToolId: "credential_save", remedyToolId: "credential_save", prefill: { kind: "api", label: "fly", baseUrl: "https://api.machines.dev", category: "ops" },
    hint: "A missing or rejected credential may be fixed by saving it through the secure card.",
  });
  assert.deepEqual(f.calls, []);
});
