import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { UIResource } from "@jini-ai/core/contracts/site/protocol-mcp-ui";
import { createFakeSiteUpdate, type FakeSiteUpdateOptions, type SiteRelease } from "@jini-ai/devops/deploy";
import { buildSiteUpdateRegistrations, type SiteUpdateRuntime, type SiteUpdateToolDeps } from "../tools.js";

import type { PreparedSiteUpdate } from "@jini-ai/devops/deploy";
import { handOffApproved } from "../approved-handoff.js";

/** @file The approved hand-off: nothing reaches the update supervisor without the owner's click and an uncancelled preparation. */

const APPLY = "site_update_apply";
const OWNER = "owner-1";

function setup({ abortDuringPreparation }: { abortDuringPreparation?: AbortController } = {}) {
  const fake = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "Faster pages." } });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const supervisor: string[] = [];
  const lock: string[] = [];
  const readiness = { check: async (...args: Parameters<typeof fake.ports.readiness.check>) => { abortDuringPreparation?.abort(); return fake.ports.readiness.check(...args); } };
  const handoff = {
    submitPrepared: async ({ prepared }: { prepared: PreparedSiteUpdate }) => { supervisor.push(`submit:${prepared.plan.toVersion}`); return { operationId: "op-1" }; },
    readLastAttempt: async () => { supervisor.push("read"); return undefined; },
  };
  const deps: SiteUpdateToolDeps & { runtime: SiteUpdateRuntime } = {
    authorize: async () => {},
    readOwnerId: async () => OWNER,
    runtime: { feed: fake.feed, site: fake.ports.site, backup: fake.ports.backup, readiness, ids: fake.ports.ids, runningVersion: async () => fake.state.liveVersion, handoff,
      lock: { withLock: async ({ run }) => { lock.push("acquire"); try { return await run(); } finally { lock.push("release"); } } } },
  };
  const tool = buildSiteUpdateRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === APPLY)!;
  return { fake, surfaceExchanges, tool, supervisor, lock };
}

async function approve({ tool, store, decision, controller }: { tool: ToolRegistration; store: ReturnType<typeof setup>["surfaceExchanges"]; decision: "confirm" | "cancel"; controller: AbortController }) {
  const emitted: unknown[] = [];
  const ctx = { executionId: "e", principal: { id: OWNER }, run: { id: "r" }, input: {}, signal: controller.signal } as ToolExecutionContext;
  const pending = tool.handler(ctx, { emitSurface: async (s: unknown) => void emitted.push(s) } as never) as Promise<Record<string, unknown>>;
  pending.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  return { pending, answer: () => {
    const plan = JSON.parse(ui.resource.text.match(/var PLAN = (.+);/)![1]!) as Record<string, { params: Record<string, unknown> }>;
    const params = plan[decision]!.params;
    return store.deliver({ exchangeId: params[SURFACE_EXCHANGE_ID_PARAM] as string, principalId: OWNER, params }, { toolId: APPLY });
  } };
}

test("declining the card or cancelling before acceptance leaves the supervisor untouched", async () => {
  const declined = setup();
  const card = await approve({ tool: declined.tool, store: declined.surfaceExchanges, decision: "cancel", controller: new AbortController() });
  await card.answer();
  assert.equal((await card.pending).applied, false);
  assert.deepEqual(declined.supervisor, [], "declining the card never reaches the supervisor");

  const early = setup();
  const controller = new AbortController();
  const earlyCard = await approve({ tool: early.tool, store: early.surfaceExchanges, decision: "confirm", controller });
  controller.abort();
  await earlyCard.answer();
  await earlyCard.pending.catch(() => undefined);
  assert.deepEqual(early.supervisor, [], "cancelled before preparation: no supervisor call");
  assert.deepEqual(early.fake.calls.filter((call) => call.startsWith("backup")), [], "and no backup was taken");

  const late = new AbortController();
  const during = setup({ abortDuringPreparation: late });
  const lateCard = await approve({ tool: during.tool, store: during.surfaceExchanges, decision: "confirm", controller: late });
  await lateCard.answer();
  await lateCard.pending.catch(() => undefined);
  assert.deepEqual(during.supervisor, [], "cancelled during preparation: the lease is released without a submit");
  assert.deepEqual(during.lock, ["acquire", "release"]);

  const accepted = setup();
  const okCard = await approve({ tool: accepted.tool, store: accepted.surfaceExchanges, decision: "confirm", controller: new AbortController() });
  await okCard.answer();
  assert.deepEqual(await okCard.pending, { applied: false, outcome: "updating", operationId: "op-1", message: "Updating to 1.3.0. The site restarts on the new version and is put back on 1.2.0 if it does not work." });
  assert.deepEqual(accepted.supervisor, ["submit:1.3.0"]);
});

test("after submit starts the durable supervisor accepts without inheriting the caller signal", async () => {
  const controller = new AbortController();
  const plan = { fromVersion: "1.2.0", toVersion: "1.3.0", notes: "Release notes." };
  const submissions: unknown[] = [];
  const result = await handOffApproved({
    plan,
    approvedBy: OWNER,
    ports: {
      ids: { newId: () => assert.fail("preparing this update should need no error id") },
      backup: { createBackup: async (required, optional) => {
        assert.deepEqual([required, optional], [{ fromVersion: "1.2.0" }, { signal: controller.signal }]);
        return { backupId: "backup-opaque" };
      } },
      readiness: { check: async (required, optional) => {
        assert.deepEqual([required, optional], [{ toVersion: "1.3.0" }, { signal: controller.signal, backupId: "backup-opaque", fromVersion: "1.2.0" }]);
        return { status: "ok" };
      } },
    },
    handoff: {
      submitPrepared: async ({ prepared }, options) => {
        submissions.push([prepared.plan, prepared.backupId, options]);
        // The caller disconnects during submission. The supervisor has a separate lifetime.
        controller.abort();
        options?.signal?.throwIfAborted();
        return { operationId: "durable-update-1" };
      },
      readLastAttempt: async () => assert.fail("handoff does not read status"),
    },
  }, { signal: controller.signal });
  assert.deepEqual(submissions, [[{ fromVersion: "1.2.0", toVersion: "1.3.0", notes: "Release notes." }, "backup-opaque", undefined]]);
  assert.deepEqual(result, {
    applied: false, outcome: "updating", operationId: "durable-update-1",
    message: "Updating to 1.3.0. The site restarts on the new version and is put back on 1.2.0 if it does not work.",
  });
});
