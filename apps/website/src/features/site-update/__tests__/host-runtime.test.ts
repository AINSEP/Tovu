import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { UIResource } from "@jini-ai/core/contracts/site/protocol-mcp-ui";
import { createFakeSiteUpdate, finishPreparedSiteUpdate } from "@jini-ai/devops/deploy";
import { createSiteUpdateRuntime, type SiteUpdateHost } from "../host-runtime.js";
import { buildSiteUpdateRegistrations, type SiteUpdateRuntime } from "../tools.js";

/**
 * @file Both host kinds reach the platform only through `site_update_apply`'s approval card; no host kind, no tools.
 * FIX 16: apply needs a durable hand-off, so the card's update reaches the host ports through a fake supervisor.
 */

const APPLY = "site_update_apply";

function world() {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "Faster pages." } });
  const platform: string[] = [];
  const health = { check: async () => ({ status: "healthy" as const }) };
  let running = "1.2.0";
  const hosts = {
    desktop: { kind: "desktop", app: {
      currentVersion: async () => running, stage: async ({ version }) => void platform.push(`stage:${version}`),
      applyStaged: async ({ version }) => { platform.push(`applyStaged:${version}`); running = version; }, rollbackTo: async ({ version }) => void platform.push(`rollbackTo:${version}`),
    }, migrate: { migrate: async () => void platform.push("migrate"), restore: async () => void platform.push("restore") }, health },
    "self-hosted": { kind: "self-hosted", images: {
      currentTag: async () => running, setTag: async ({ tag }) => { platform.push(`setTag:${tag}`); running = tag; }, redeploy: async ({ tag }) => void platform.push(`redeploy:${tag}`),
    }, health },
  } as const satisfies Record<string, SiteUpdateHost>;
  const shared = { feed: fake.feed, backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => running };
  return { hosts, shared, platform };
}

async function applyThroughCard(kind: "desktop" | "self-hosted", decision: "confirm" | "cancel") {
  const { shared, platform, hosts } = world();
  const host: SiteUpdateHost = hosts[kind];
  const hostRuntime = createSiteUpdateRuntime({ host, shared }) as SiteUpdateRuntime;
  // A durable supervisor stand-in: it replaces the site through the host's own ports and finishes the update.
  const handoff = { readLastAttempt: async () => undefined, submitPrepared: async ({ prepared }: { prepared: Parameters<typeof finishPreparedSiteUpdate>[0]["prepared"] }) => {
    const { summary } = await hostRuntime.site.applyUpdate({ plan: prepared.plan, backupId: prepared.backupId });
    await finishPreparedSiteUpdate({ prepared, ports: { site: hostRuntime.site, ids: hostRuntime.ids }, apply: { status: "landed", summary } });
    return { operationId: "op-1" };
  } };
  const runtime = { ...hostRuntime, handoff };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tool = buildSiteUpdateRegistrations({ authorize: async () => {}, readOwnerId: async () => "owner-1", runtime }, { surfaceExchanges } as never).find((r: ToolRegistration) => r.descriptor.id === APPLY)!;
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (s) => void emitted.push(s);
  const pending = tool.handler({ executionId: "e", principal: { id: "owner-1" }, run: { id: "r" }, input: {}, signal: new AbortController().signal } as ToolExecutionContext, { emitSurface });
  await new Promise((resolve) => setImmediate(resolve));
  const before = [...platform];
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const params = (JSON.parse(ui.resource.text.match(/var PLAN = (.+);/)![1]!) as Record<string, { params: Record<string, unknown> }>)[decision]!.params;
  surfaceExchanges.deliver({ exchangeId: params[SURFACE_EXCHANGE_ID_PARAM] as string, principalId: "owner-1", params }, { toolId: APPLY });
  const result = (await pending) as { applied: boolean; outcome: string };
  return { before, platform, result, cards: emitted.length };
}

test("desktop: one card is shown, the platform is untouched until it is confirmed, then the app is updated", async () => {
  const run = await applyThroughCard("desktop", "confirm");
  assert.equal(run.cards, 1);
  assert.deepEqual(run.before, [], "nothing may run before the owner clicks");
  assert.equal(run.result.outcome, "updating", "the supervisor, not the website, owns the swap");
  assert.deepEqual(run.platform, ["stage:1.3.0", "migrate", "applyStaged:1.3.0"]);
});

test("self-hosted: same card, platform untouched until confirmed, then the image tag is bumped", async () => {
  const run = await applyThroughCard("self-hosted", "confirm");
  assert.equal(run.cards, 1);
  assert.deepEqual(run.before, []);
  assert.equal(run.result.outcome, "updating", "the supervisor, not the website, owns the swap");
  assert.deepEqual(run.platform, ["setTag:1.3.0", "redeploy:1.3.0"]);
});

for (const kind of ["desktop", "self-hosted"] as const) {
  test(`${kind}: cancelling the card leaves the platform untouched`, async () => {
    const run = await applyThroughCard(kind, "cancel");
    assert.equal(run.result.applied, false);
    assert.deepEqual(run.platform, []);
  });
}

test("no host kind, or one this build does not know, gives no runtime and the tools are absent", () => {
  const { shared } = world();
  for (const host of [{ kind: "none" }, { kind: "hosted-elsewhere" }] as unknown as SiteUpdateHost[]) {
    const runtime = createSiteUpdateRuntime({ host, shared });
    assert.equal(runtime, null);
    assert.deepEqual(buildSiteUpdateRegistrations({ authorize: async () => {}, readOwnerId: async () => "owner-1", runtime }, {} as never), []);
  }
});

test("nothing is automatic: building the runtime and the tools touches no port", () => {
  const { hosts, shared, platform } = world();
  let feedCalls = 0;
  const feed = { latestRelease: async () => { feedCalls += 1; return null; } };
  for (const host of [hosts.desktop, hosts["self-hosted"]]) buildSiteUpdateRegistrations({ authorize: async () => {}, readOwnerId: async () => "owner-1", runtime: createSiteUpdateRuntime({ host, shared: { ...shared, feed } }) }, {} as never);
  assert.equal(feedCalls, 0);
  assert.deepEqual(platform, []);
});
