import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import { assertVersionedWrite } from "@jini-ai/core/optimistic-concurrency";
import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";
import { RoutineService, type Routine, type RoutinePersistence, type RoutineRun, type RoutineRunHandler } from "@jini-ai/daemon";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { WebhookDeliveryRecord } from "@jini-ai/integrations/webhooks";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/site/repo.memory";
import { createFixedSecretSigner } from "@jini-ai/integrations/webhooks/site/signing";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { HttpClientPort } from "#src/platform/http/ports";
import type { HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { postRepoFor } from "../../../../features/post/repo.js";
import { buildPostRecord } from "../../../../features/post/__tests__/post-record.fixture.js";
import { createAgentPauseGate, sqlAgentPauseHoldStore, type AgentPauseGate, type AgentResumeResult } from "../agent-pause-gate.js";
import { buildAgentPauseRegistrations } from "../agent-pause-tools.js";
import { webhookEnvelopeStoreFor } from "../modules/integrations.js";
import { startServingWebhookDeliveryWorker, type ServingWebhookDeliveryDeps, type WebhookDeliveryScheduler } from "../webhook-delivery-worker.js";

/**
 * @file P10-H4.T: the admin assistant switch exercised end to end against the real P3 host pieces —
 * `createAgentPauseGate` over the SQL hold store on a real in-memory SQLite content DB (the hold
 * row is what survives the restart), the production post repo's go-live read, the production
 * serving webhook worker, Jini's `RoutineService`, and the real `resume_agent_work` registration
 * (only the human's answer on the card is stubbed). External effects (webhook POSTs, a post going
 * live, a routine firing) are fakes that COUNT, so each phase checks how many times work actually
 * happened, not a status string. A fake clock drives one pass per phase; there is no new worker.
 */

const WS = "workspace-1";
const T0 = "2026-11-24T00:00:00.000Z";
const AT = {
  boot: "2026-11-24T00:10:00.000Z",
  due: "2026-11-24T01:00:00.000Z",
  off: "2026-11-24T02:00:00.000Z",
  onWithoutApproval: "2026-11-24T03:00:00.000Z",
  declined: "2026-11-24T04:00:00.000Z",
  approved: "2026-11-24T05:00:00.000Z",
  settled: "2026-11-24T06:00:00.000Z",
} as const;
const KINDS = ["agent", "person"] as const;
type Kind = (typeof KINDS)[number];
type Leg = "webhook" | "post" | "routine";
type EffectCounts = Record<`${Leg}:${Kind}`, number>;
type Phase = "off" | "onWithoutApproval" | "declined" | "approved" | "settled";

const ROUTINE_GATE_DEFECT = "P3 lane: no routine consults the agent-pause gate — Tovu composes no routine runner and Jini's `Routine` carries no creator kind, so an agent-created routine still fires while the assistant is off";
const idleScheduler: WebhookDeliveryScheduler = { every: () => ({ cancel: () => {} }), after: () => ({ cancel: () => {} }) };
const emptyEffects = (): EffectCounts => ({ "webhook:agent": 0, "webhook:person": 0, "post:agent": 0, "post:person": 0, "routine:agent": 0, "routine:person": 0 });

interface HeldWorkRequired {
  /** Boots the real gate over the durable hold store with the switch read once, as a process does. */
  gate: (required: { assistantEnabled: boolean }) => AgentPauseGate;
  /** Creates the agent-made and person-made artifacts before the switch is ever turned off. */
  schedule: () => Promise<void>;
  /** One fake-clock pass over every consumer of held work. */
  tick: (required: { gate: AgentPauseGate }) => Promise<void>;
  effects: EffectCounts;
  /** Drops per-process state; durable rows (SQLite, the stand-in repos) survive. */
  restart: () => void;
  setNow: (iso: string) => void;
}

/** Answers the real `resume_agent_work` card with `answer`; `asked` records every card shown. */
async function resumeThroughCard(required: { gate: AgentPauseGate; answer: HumanConfirmOutcome; asked: string[] }, _optional = {}): Promise<AgentResumeResult> {
  const { gate, answer, asked } = required;
  const deps = { workspaceId: WS, agentPauseGate: gate, authorize: async () => ({ allowed: true, reason: "owner" }) };
  const [registration] = buildAgentPauseRegistrations({ deps, surfaces: {} as never }, {
    askHuman: async ({ spec }) => { asked.push(spec.toolId); return answer; },
  });
  assert.ok(registration);
  const ctx = { input: {}, principal: { id: "owner-1" }, signal: new AbortController().signal };
  return await registration.handler(ctx as never, { emitSurface: () => {} } as never) as AgentResumeResult;
}

/**
 * Drives the held artifacts through off → restart on → declined card → approved card → one more
 * pass, snapshotting the effect counts after each phase.
 */
async function exerciseHeldWork(required: HeldWorkRequired, _optional = {}) {
  const { gate, schedule, tick, effects, restart, setNow } = required;
  const snapshots = {} as Record<Phase, EffectCounts>;
  const asked: string[] = [];
  const pass = async (phase: Phase, current: AgentPauseGate) => {
    setNow(AT[phase]);
    await tick({ gate: current });
    snapshots[phase] = { ...effects };
  };
  setNow(T0);
  await schedule();
  setNow(AT.boot);
  const off = gate({ assistantEnabled: false });
  // Boot IS the off-transition: the composition records the hold before any worker ticks.
  await off.recordSwitchState();
  await pass("off", off);
  restart();
  setNow(AT.onWithoutApproval);
  const on = gate({ assistantEnabled: true });
  await on.recordSwitchState();
  await pass("onWithoutApproval", on);
  const declined = await resumeThroughCard({ gate: on, answer: { confirmed: false, reason: "declined" }, asked });
  await pass("declined", on);
  const approved = await resumeThroughCard({ gate: on, answer: { confirmed: true }, asked });
  await pass("approved", on);
  await pass("settled", on);
  return { snapshots, asked, declined, approved };
}

function delivery({ id, subscriptionId }: { id: string; subscriptionId: string }, _optional = {}): WebhookDeliveryRecord {
  return {
    id, workspaceId: WS, subscriptionId, eventId: `event-${id}`, topic: "form.submission.received",
    status: "pending", attempts: 0, nextAttemptAt: AT.due, lastResponseStatus: null, lastError: null,
    signedWithVersion: null, createdAt: T0, deliveredAt: null, deadAt: null,
  };
}

function routine({ kind }: { kind: Kind }, _optional = {}): Routine {
  return {
    id: `routine-${kind}`, name: `${kind} routine`, prompt: "Summarize the week", schedule: { kind: "hourly", minute: 0 },
    target: { mode: "create_each_run" }, skillId: null, agentId: null, context: {}, enabled: true,
    nextRunAt: Date.parse(AT.due), lastRun: null, createdAt: Date.parse(T0), updatedAt: Date.parse(T0),
  };
}

/** One webhook subscription with a due delivery and one post scheduled for `AT.due`, per creator kind. */
async function seedArtifacts(required: { subscriptions: InMemoryWebhookSubscriptionRepo; deliveries: InMemoryWebhookDeliveryRepo; posts: ReturnType<typeof postRepoFor> }, _optional = {}) {
  const { subscriptions, deliveries, posts } = required;
  for (const kind of KINDS) {
    await subscriptions.save({
      id: `sub-${kind}`, workspaceId: WS, ownerPrincipalId: "principal-1", label: kind, targetUrl: `https://example.com/${kind}`,
      topics: ["form.submission.received"], secretVersion: 1, previousSecretVersion: null, status: "active",
      createdByPrincipalId: "principal-1", createdByPluginId: null, createdByKind: kind, createdAt: T0, updatedAt: T0, disabledAt: null, version: 1,
    });
    const record = delivery({ id: `d-${kind}`, subscriptionId: `sub-${kind}` });
    const envelope = { deliveryId: record.id, eventId: record.eventId, topic: record.topic, workspaceId: WS, occurredAt: T0, data: {} };
    await deliveries.enqueue({ record }, { envelope });
    await webhookEnvelopeStoreFor({ deliveryRepo: deliveries }).save({ deliveryId: record.id, envelope });
    await posts.save(buildPostRecord({ id: `post-${kind}`, slug: `post-${kind}`, workspaceId: WS, status: "published", kind: "post", publishAt: AT.due, updatedAt: T0, createdByKind: kind }));
  }
}

/** The routine rows' durable stand-in: a flat run history over a fixed routine list. */
function memoryRoutinePersistence(required: { routines: Routine[] }, _optional = {}): RoutinePersistence {
  const runs: RoutineRun[] = [];
  return {
    list: () => required.routines,
    insertRun: ({ run }) => { runs.push(run); return true; },
    updateRun: ({ id, patch }) => { const run = runs.find((r) => r.id === id); if (run) Object.assign(run, patch); },
    getLatestRun: ({ routineId }) => runs.filter((r) => r.routineId === routineId).at(-1) ?? null,
  };
}

/** The site: SQLite content DB, durable stand-in repos, and counting fakes for every external effect. */
async function site(_required = {}, _optional = {}) {
  let now = T0;
  const clock = { nowIso: () => now };
  const kernel = freshSqliteContentKernel();
  const store = sqlAgentPauseHoldStore({ kernel: kernel as KyselyKernel<unknown> });
  const effects = emptyEffects();
  const subscriptions = new InMemoryWebhookSubscriptionRepo({ assertVersionedWrite });
  const deliveries = new InMemoryWebhookDeliveryRepo();
  const routines = KINDS.map((kind) => routine({ kind }));
  const persistence = memoryRoutinePersistence({ routines });
  const fired = new Set<string>();
  const wentLive = new Set<string>();
  let posts = postRepoFor({ kernel, mediaAccessEvidence: createMediaAccessEvidence() }, {});
  let routineService = new RoutineService({ persistence }, { now: () => Date.parse(now) });
  const kindOf = (id: string): Kind => (id.includes("agent") ? "agent" : "person");
  // The routine's external effect: whatever the host's run handler would start (an agent run).
  const runRoutine: RoutineRunHandler = async ({ routine: due }) => {
    effects[`routine:${kindOf(due.id)}`] += 1;
    return { projectId: "project-1", conversationId: `conversation-${due.id}`, agentRunId: `run-${due.id}`, completion: Promise.resolve({ status: "succeeded" as const }) };
  };
  routineService.setRunHandler({ handler: runRoutine });
  const httpClient: HttpClientPort = { send: async (request) => {
    effects[`webhook:${kindOf(request.url)}`] += 1;
    return { status: 200, headers: {}, bodyText: "ok" };
  } };

  const schedule = () => seedArtifacts({ subscriptions, deliveries, posts });

  const tick = async ({ gate }: { gate: AgentPauseGate }) => {
    const deps: ServingWebhookDeliveryDeps = {
      webhookSubscriptionRepo: subscriptions, webhookDeliveryRepo: deliveries, clock, observability: createNoopObservabilityPort({}),
      webhookSigner: createFixedSecretSigner({ secrets: new Map(KINDS.map((kind) => [`sub-${kind}`, Buffer.from("shared-secret")])) }),
      agentPauseGate: gate,
    };
    const worker = startServingWebhookDeliveryWorker({ deps }, { httpClient, scheduler: idleScheduler, log: () => {} });
    await worker.tick();
    await worker.stop();
    for (const post of await posts.listGoLiveCandidates({ workspaceId: WS, nowIso: now })) {
      if (wentLive.has(post.id)) continue;
      wentLive.add(post.id);
      effects[`post:${kindOf(post.id)}`] += 1;
    }
    for (const due of routines) {
      if (fired.has(due.id) || (due.nextRunAt ?? Infinity) > Date.parse(now)) continue;
      fired.add(due.id);
      await (await routineService.runNow({ routineId: due.id })).completion;
    }
  };

  const restart = () => {
    routineService.stop({});
    posts = postRepoFor({ kernel, mediaAccessEvidence: createMediaAccessEvidence() }, {});
    routineService = new RoutineService({ persistence }, { now: () => Date.parse(now) });
    routineService.setRunHandler({ handler: runRoutine });
  };

  const gate = ({ assistantEnabled }: { assistantEnabled: boolean }) => createAgentPauseGate({ store, workspaceId: WS, assistantEnabled: () => assistantEnabled, clock });
  const artifacts = async () => ({
    subscription: (await subscriptions.findById({ workspaceId: WS, id: "sub-agent" }))?.status,
    delivery: (await deliveries.findById({ workspaceId: WS, id: "d-agent" }))?.status,
    post: (await posts.findById({ workspaceId: WS, id: "post-agent" }))?.status,
  });
  return { required: { gate, schedule, tick, effects, restart, setNow: (iso: string) => { now = iso; } }, artifacts, store };
}

const counts = (snapshot: EffectCounts, leg: Leg) => ({ agent: snapshot[`${leg}:agent`], person: snapshot[`${leg}:person`] });

// Why-comment — the switch is a durable hold on future effects, not a request to delete artifacts or replay work that already completed.
test("assistant off holds existing agent artifacts while human work continues", async (t) => {
  const rig = await site();
  const { snapshots } = await exerciseHeldWork(rig.required);
  assert.deepEqual(counts(snapshots.off, "webhook"), { agent: 0, person: 1 }, "the agent webhook is held; the person's delivers once");
  assert.deepEqual(counts(snapshots.off, "post"), { agent: 0, person: 1 }, "the agent post does not go live; the person's does");
  assert.equal(snapshots.off["routine:person"], 1, "the person's routine still runs");
  await t.test("the agent-created routine is held too", { todo: ROUTINE_GATE_DEFECT }, () => {
    assert.equal(snapshots.off["routine:agent"], 0);
  });
  assert.deepEqual(await rig.artifacts(), { subscription: "active", delivery: "delivered", post: "published" }, "nothing the agent made is deleted or disabled (released and settled by the end)");
});

test("switching on after restart does not resume work until owner approval", async (t) => {
  const rig = await site();
  const { snapshots, declined } = await exerciseHeldWork(rig.required);
  for (const phase of ["onWithoutApproval", "declined"] as const) {
    assert.equal(snapshots[phase]["webhook:agent"], 0, `${phase}: the agent webhook stays held`);
    assert.equal(snapshots[phase]["post:agent"], 0, `${phase}: the agent post stays unpublished`);
  }
  assert.deepEqual(declined, { resumed: false, reason: "declined" });
  assert.equal(await rig.store.heldSince({ workspaceId: WS }), null, "only the approved card released the hold");
  await t.test("the agent-created routine stays held after the restart", { todo: ROUTINE_GATE_DEFECT }, () => {
    assert.equal(snapshots.onWithoutApproval["routine:agent"], 0);
  });
});

test("approved resume releases only held agent work", async (t) => {
  const rig = await site();
  const { snapshots, asked, approved } = await exerciseHeldWork(rig.required);
  assert.deepEqual(asked, ["resume_agent_work", "resume_agent_work"], "both resumes went through the owner's card");
  assert.deepEqual(approved, { resumed: true });
  assert.equal(snapshots.declined["webhook:agent"] + snapshots.declined["post:agent"], 0, "a declined card releases nothing");
  for (const phase of ["approved", "settled"] as const) {
    assert.deepEqual(counts(snapshots[phase], "webhook"), { agent: 1, person: 1 }, `${phase}: the held webhook goes out once; the person's is not replayed`);
    assert.deepEqual(counts(snapshots[phase], "post"), { agent: 1, person: 1 }, `${phase}: the held post goes live once; the person's is not replayed`);
  }
  assert.equal(snapshots.settled["routine:person"], 1, "the person's routine is not replayed");
  await t.test("the agent-created routine runs once, only after approval", { todo: ROUTINE_GATE_DEFECT }, () => {
    assert.equal(snapshots.declined["routine:agent"], 0);
    assert.equal(snapshots.settled["routine:agent"], 1);
  });
});
