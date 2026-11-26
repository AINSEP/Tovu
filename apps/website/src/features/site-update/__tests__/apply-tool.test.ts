import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { UIResource } from "@jini-ai/core/contracts/site/protocol-mcp-ui";
import { createFakeSiteUpdate, finishPreparedSiteUpdate, type FakeSiteUpdateOptions, type SiteRelease, type SiteUpdateRunResult } from "@jini-ai/devops/deploy";
import { createOperationLock } from "@jini-ai/db/recovery/operation-lock";
import { createOperationUpdateLock } from "../operation-update-lock.js";
import type { ApprovedHandoffPorts } from "../approved-handoff.js";
import { buildSiteUpdateRegistrations, type SiteUpdateRuntime, type SiteUpdateToolDeps } from "../tools.js";

/**
 * @file `site_update_apply`: never runs without the owner's card; the approval is for exactly the version shown.
 * FIX 16: apply is exposed only with a durable hand-off, so every apply here runs through a fake durable supervisor
 * that replaces the site and finishes the update the way the real one would after the restart.
 */

const APPLY = "site_update_apply";
const OWNER = "owner-1";

/** A durable supervisor stand-in: accepts the prepared update, then applies, verifies and rolls back out of band. */
function createFakeSupervisor(fake: ReturnType<typeof createFakeSiteUpdate>) {
  const finished: SiteUpdateRunResult[] = [];
  const handoff: ApprovedHandoffPorts = {
    submitPrepared: async ({ prepared }) => {
      const apply = await fake.ports.site.applyUpdate({ plan: prepared.plan, backupId: prepared.backupId })
        .then(({ summary }) => ({ status: "landed" as const, summary }), () => ({ status: "failed" as const }));
      finished.push(await finishPreparedSiteUpdate({ prepared, ports: { site: fake.ports.site, ids: fake.ports.ids }, apply }));
      return { operationId: `op-${finished.length}` };
    },
    readLastAttempt: async () => undefined,
  };
  return { handoff, finished };
}

function setup(options: FakeSiteUpdateOptions = {}, latest: SiteRelease = { version: "1.3.0", notes: "Faster pages." }) {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest }, options);
  const supervisor = createFakeSupervisor(fake);
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const deps: SiteUpdateToolDeps & { runtime: SiteUpdateRuntime } = {
    authorize: async () => {},
    readOwnerId: async () => OWNER,
    runtime: { feed: fake.feed, site: fake.ports.site, backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => fake.state.liveVersion, handoff: supervisor.handoff },
  };
  const tool = buildSiteUpdateRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === APPLY)!;
  assert.ok(tool, "site_update_apply must be registered");
  return { fake, surfaceExchanges, tool, deps, finished: supervisor.finished };
}

function invoke(tool: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter) {
  const ctx = { executionId: "e", principal: { id: OWNER }, run: { id: "r" }, input, signal: new AbortController().signal } as ToolExecutionContext;
  return tool.handler(ctx, emitSurface ? { emitSurface } : {});
}

async function raiseCard(tool: ToolRegistration, input: unknown = {}) {
  const emitted: unknown[] = [];
  const pending = invoke(tool, input, async (s) => void emitted.push(s));
  pending.catch(() => {}); // a refusal may land before the test awaits it
  await new Promise((resolve) => setImmediate(resolve));
  return { emitted, pending, ui: emitted[0] ? (emitted[0] as { payload: { resource: UIResource } }).payload.resource : undefined };
}

function answer(store: ReturnType<typeof setup>["surfaceExchanges"], ui: UIResource, decision: "confirm" | "cancel") {
  const plan = JSON.parse(ui.resource.text.match(/var PLAN = (.+);/)![1]!) as Record<string, { params: Record<string, unknown> }>;
  const params = plan[decision]!.params;
  return store.deliver({ exchangeId: params[SURFACE_EXCHANGE_ID_PARAM] as string, principalId: OWNER, params }, { toolId: APPLY });
}

test("the card shows from-version, to-version and notes, and nothing is applied while it is open", async () => {
  const { tool, fake, surfaceExchanges } = setup();
  const { ui, pending } = await raiseCard(tool);
  assert.ok(ui, "a card must be shown");
  for (const text of ["1.2.0", "1.3.0", "Faster pages."]) assert.ok(ui.resource.text.includes(text), `card must show ${text}`);
  assert.deepEqual(fake.calls, []);
  answer(surfaceExchanges, ui, "cancel");
  await pending;
});

test("cancel: nothing is applied and the model is told so", async () => {
  const { tool, fake, surfaceExchanges } = setup();
  const { ui, pending } = await raiseCard(tool);
  answer(surfaceExchanges, ui!, "cancel");
  const result = (await pending) as { applied: boolean; cancelled: boolean };
  assert.equal(result.applied, false);
  assert.equal(result.cancelled, true);
  assert.deepEqual(fake.calls, [], "the adapter must not be touched without approval");
});

test("no way to ask (headless run): refuses and nothing is applied", async () => {
  const { tool, fake } = setup();
  await assert.rejects(invoke(tool, {}), /no interactive confirmation channel/);
  assert.deepEqual(fake.calls, []);
});

test("input cannot stand in for the click", async () => {
  const { tool, fake } = setup();
  await assert.rejects(invoke(tool, { confirm: true }, async () => {}), /'confirm' is not an input/);
  assert.deepEqual(fake.calls, []);
});

test("a version other than the one on offer is refused before any card or change", async () => {
  const { tool, fake } = setup();
  const { emitted, pending } = await raiseCard(tool, { toVersion: "9.9.9" });
  await assert.rejects(pending, /9\.9\.9 is not the version on offer \(1\.3\.0\)\. Nothing was changed\./);
  assert.equal(emitted.length, 0);
  assert.deepEqual(fake.calls, []);
});

test("failed update preparation does not expose upstream details", async () => {
  const { tool, fake } = setup();
  fake.ports.site.checkForUpdate = async () => { throw new Error("/private/site token=synthetic-private-marker"); };
  const { emitted, pending } = await raiseCard(tool);
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, "Could not check for updates. Nothing was changed.");
    return true;
  });
  assert.deepEqual(emitted, []);
  assert.deepEqual(fake.calls, []);
});

test("confirm: the approved version is handed to the durable supervisor, which applies it with a plain-words step log", async () => {
  const { tool, fake, surfaceExchanges, finished } = setup();
  const { ui, pending } = await raiseCard(tool, { toVersion: "1.3.0" });
  answer(surfaceExchanges, ui!, "confirm");
  const result = (await pending) as { applied: boolean; outcome: string; operationId: string };
  assert.equal(result.applied, false, "the website itself never claims the swap: the supervisor owns it");
  assert.equal(result.outcome, "updating");
  assert.equal(result.operationId, "op-1");
  assert.equal(finished.length, 1);
  assert.equal(finished[0]!.outcome, "updated");
  assert.equal(finished[0]!.summary, "Updated from 1.2.0 to 1.3.0. What changed: Faster pages.");
  assert.deepEqual(finished[0]!.steps.map((step) => `${step.step}: ${step.detail}`), [
    "approval: Approved by owner-1 for 1.3.0.", "backup: Backup backup-1 made of 1.2.0.", "readiness: Stored data is ready for 1.3.0.",
    "apply: Deployed 1.3.0.", "verify: The live site works on 1.3.0.",
  ]);
  assert.deepEqual(fake.calls.filter((c) => c.startsWith("applyUpdate")), ["applyUpdate:1.3.0:backup-1"]);
});

test("the approval is for the version on the card: a feed that moves on while the card is open does not change what is installed", async () => {
  const { tool, fake, surfaceExchanges } = setup();
  const { ui, pending } = await raiseCard(tool);
  fake.feed.latestRelease = async () => ({ version: "1.4.0", notes: "Surprise." });
  answer(surfaceExchanges, ui!, "confirm");
  await pending;
  assert.deepEqual(fake.calls.filter((c) => c.startsWith("applyUpdate")), ["applyUpdate:1.3.0:backup-1"]);
});

test("already on the latest: no card, nothing applied", async () => {
  const { tool, fake } = setup({}, { version: "1.2.0", notes: "" });
  const { emitted, pending } = await raiseCard(tool);
  const result = (await pending) as { applied: boolean; message: string };
  assert.equal(emitted.length, 0);
  assert.equal(result.applied, false);
  assert.equal(result.message, "You are on the latest version (1.2.0). Nothing was changed.");
  assert.deepEqual(fake.calls, []);
});

test("a blocked migration check is reported and the deploy is never started", async () => {
  const { tool, fake, surfaceExchanges, finished } = setup({ readiness: { status: "blocked", reason: "Two database changes are still pending." } });
  const { ui, pending } = await raiseCard(tool);
  answer(surfaceExchanges, ui!, "confirm");
  const result = (await pending) as { applied: boolean; outcome: string; message: string };
  assert.equal(result.applied, false);
  assert.equal(result.outcome, "blocked");
  assert.match(result.message, /Two database changes are still pending/);
  assert.equal(fake.calls.some((c) => c.startsWith("applyUpdate")), false);
  assert.deepEqual(finished, [], "a blocked preparation never reaches the supervisor");
});

test("a failed live check rolls back and says so", async () => {
  const { tool, surfaceExchanges, finished } = setup({ verify: { status: "unhealthy", reason: "the home page returned an error" } });
  const { ui, pending } = await raiseCard(tool);
  answer(surfaceExchanges, ui!, "confirm");
  assert.equal(((await pending) as { outcome: string }).outcome, "updating");
  assert.equal(finished[0]!.outcome, "rolled-back");
  assert.match(finished[0]!.summary, /rolled back to 1\.2\.0/);
});

test("permission is checked before any card is shown", async () => {
  const { tool, deps, fake } = setup();
  deps.authorize = async () => { throw new Error("no permission"); };
  const rebuilt = buildSiteUpdateRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) } as never).find((r) => r.descriptor.id === APPLY)!;
  const { emitted, pending } = await raiseCard(rebuilt);
  await assert.rejects(pending, /no permission/);
  assert.equal(emitted.length, 0);
  assert.deepEqual(fake.calls, []);
  void tool;
});

test("the live version changing while the card is open voids the approval: nothing is backed up or applied", async () => {
  const { tool, fake, surfaceExchanges } = setup();
  const { ui, pending } = await raiseCard(tool, { toVersion: "1.3.0" });
  fake.state.liveVersion = "1.2.5"; // someone updated or rolled the site by hand after the card was drawn
  answer(surfaceExchanges, ui!, "confirm");
  const result = (await pending) as { applied: boolean; outcome: string; message: string };
  assert.equal(result.applied, false);
  assert.equal(result.outcome, "refused");
  assert.match(result.message, /now on 1\.2\.5.*approved the update from 1\.2\.0.*Nothing was changed\./s);
  assert.deepEqual(fake.calls.filter((c) => c.startsWith("createBackup") || c.startsWith("applyUpdate")), []);
});

test("the version is re-read under the update lock, and the whole apply runs inside it", async () => {
  const { fake, surfaceExchanges, deps } = setup();
  const events: string[] = [];
  const runtime = deps.runtime;
  const { backup, readiness, handoff, runningVersion } = runtime;
  assert.ok(handoff, "the apply fixture needs a supervisor handoff");
  runtime.lock = { withLock: async ({ run }) => { events.push("lock-in"); try { return await run(); } finally { events.push("lock-out"); } } };
  runtime.runningVersion = async () => { events.push("read-version"); return runningVersion(); };
  runtime.backup = { createBackup: async (required, optional) => { events.push("backup"); return backup.createBackup(required, optional); } };
  runtime.readiness = { check: async (required, optional) => { events.push("readiness"); return readiness.check(required, optional); } };
  runtime.handoff = { ...handoff, submitPrepared: async (required, optional) => { events.push("submit"); return handoff.submitPrepared(required, optional); } };
  const registered = buildSiteUpdateRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === APPLY)!;
  const { ui, pending } = await raiseCard(registered, { toVersion: "1.3.0" });
  events.length = 0;
  answer(surfaceExchanges, ui!, "confirm");
  await pending;
  assert.deepEqual(events, ["lock-in", "read-version", "backup", "readiness", "submit", "lock-out"]);
  assert.equal(fake.calls.some((c) => c.startsWith("applyUpdate")), true);
});

test("a system writer who is not the installation owner cannot approve an update", async () => {
  const { tool, fake, surfaceExchanges, deps } = setup();
  const events: string[] = [];
  deps.authorize = async ({ permission }) => void events.push(`authorize:${permission}`);
  deps.readOwnerId = async () => { events.push("read-owner"); return "installation-owner"; };
  const { ui, pending } = await raiseCard(tool);
  answer(surfaceExchanges, ui!, "confirm");
  const result = (await pending) as { applied: boolean; outcome: string; message: string };
  assert.equal(result.applied, false);
  assert.equal(result.outcome, "refused");
  assert.equal(result.message, "Only this site's installation owner can approve an update. Nothing was changed.");
  assert.deepEqual(fake.calls, [], "a non-owner's click must not back up, stage or deploy anything");
  assert.deepEqual(events.slice(-2), ["authorize:system.write", "read-owner"], "the owner is checked after system.write is re-checked at redemption");
});

test("a second approved update cannot capture another backup while the first owns the site", async () => {
  const { tool, surfaceExchanges, deps } = setup();
  const runtime = deps.runtime;
  const inner = runtime.backup;
  let captures = 0;
  const { promise: firstHeld, resolve: releaseFirst } = Promise.withResolvers<void>();
  const { promise: firstEntered, resolve: enterFirst } = Promise.withResolvers<void>();
  runtime.backup = { createBackup: async (required, optional) => {
    if (++captures === 1) { enterFirst(); await firstHeld; }
    return inner.createBackup(required, optional);
  } };
  runtime.lock = createOperationUpdateLock({ lock: createOperationLock({}, {}), siteId: "site-1", clock: createSystemClock() });
  const first = await raiseCard(tool);
  let second: Awaited<ReturnType<typeof raiseCard>> | undefined;
  const timer = new AbortController();
  const deadline = delay(5_000, undefined, { signal: timer.signal }).then(() => {
    throw new Error("Timed out waiting for the first backup to start or the second approval to be refused");
  });
  try {
    answer(surfaceExchanges, first.ui!, "confirm");
    await Promise.race([firstEntered, deadline]);
    second = await raiseCard(tool);
    answer(surfaceExchanges, second.ui!, "confirm");
    await Promise.race([
      assert.rejects(second.pending, /Another update, migration or restore is running on this site\. Nothing was changed\./),
      deadline,
    ]);
  } finally {
    releaseFirst();
    timer.abort();
    await Promise.allSettled([deadline, first.pending, second?.pending]);
  }
  assert.equal(((await first.pending) as { outcome: string }).outcome, "updating");
  assert.equal(captures, 1, "only the update that owns the site may capture a backup");
});

test("absent handoff exposes no apply operation: the runtime is check-only (FIX 16, M apply-without-handoff)", async () => {
  const { deps, fake, surfaceExchanges } = setup();
  const { handoff: _dropped, ...inProcess } = deps.runtime;
  const ids = buildSiteUpdateRegistrations({ ...deps, runtime: inProcess }, { surfaceExchanges }).map((r) => r.descriptor.id);
  assert.deepEqual(ids, ["site_update_check"], "site ports without a durable hand-off must not register site_update_apply");
  assert.deepEqual(fake.calls, []);
});
