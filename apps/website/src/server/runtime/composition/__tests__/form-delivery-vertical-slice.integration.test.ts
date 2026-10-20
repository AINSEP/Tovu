import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "@jini-ai/infra/events/outbox";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { processOutbox } from "#src/contracts/core/events/index";
import { loginAsOwner, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createApp } from "../app.js";
import { createServingApp } from "../serving-app.js";
import {
  awaitNewPlan, awaitReceivedSettled, bootSite, countAutoPulls, deliveryJobs, FakePushDestinations, FakeReceiver, FORM_ID, FORM_SLUG, fixtureToken, installFixtureHook,
  installFixturePlugin, isolateSiteEnvironment, outboxRows, plannedSubmissions, PUSH_A, PUSH_B, RECEIVER_URL, removeSiteDir, seedSite, waitFor,
  writeAutoPull, writeBindings, type FixtureSite,
} from "./form-delivery-vertical-slice.fixture.js";

/**
 * @file VERTICAL-SLICE PROOF of form delivery to several destinations, through the real site
 * composition on a fresh SQLite site folder: a submission comes in through the real pull import
 * (a fake receiver contributed by a test Agent Plugin), `form.submission.received` plans it once
 * with one frozen outbox job per matching binding, and the real Jini outbox worker (the site's
 * `processOutbox`, with its per-event retry policy) delivers each job to one of two fake push
 * adapters registered through the real form-destinations registry. Then the automatic pull: the
 * `core.forms/autoPull` setting, the startup and owner sign-in triggers, and the per-receiver lease.
 *
 * Clocks: the worker runs on a fake clock (its `clock` port). The composition's own clock has no
 * seam (`deps.ts` builds it from `Date`), so planning timestamps and the pull lease use the wall
 * clock; the fake clock starts years ahead so every wall-clock row is already due to it.
 */

const T0 = "2030-01-01T00:00:00.000Z";
const RETRY_AFTER_MS = 10 * 60_000;

/** The original two bindings: A takes every form, B only the contact form. */
function originalBindings(connections: { connectionA: string; connectionB: string }) {
  return [
    { bindingId: "binding-a", adapterId: PUSH_A, connectionRef: connections.connectionA, enabled: true, config: { table: "leads" } },
    { bindingId: "binding-b", adapterId: PUSH_B, connectionRef: connections.connectionB, enabled: true, formIds: [FORM_ID], config: { sheet: "Leads" } },
  ];
}

describe("form delivery vertical slice: pull → plan → two destinations through the outbox", () => {
  // Created in `before`, so a run filtered to the other suite leaves no folder behind.
  let dir = "";
  let home = "";
  const receiver = new FakeReceiver();
  const destinations = new FakePushDestinations();
  const clock = createFakeClock({ startIso: T0 });
  let site: FixtureSite;
  let connections: { connectionA: string; connectionB: string };
  let restoreEnv = (): void => undefined;
  let removeHook = (): void => undefined;
  /** The first submission and its two job ids, set by the first test. */
  const first = { submissionId: "", jobIdA: "", jobIdB: "" };

  /** One drain of the site's real outbox worker on the fake clock. */
  const drain = () => processOutbox({ outbox: site.deps.outbox, bus: site.deps.bus, clock }, { random: () => 0 });
  const status = (submissionId: string) => site.deps.formDeliveryStatus!.forSubmission({ workspaceId: site.deps.workspaceId, submissionId });
  /** Pulls one new receiver row through the composed manual pull and returns its planned submission id. */
  const pullOne = async (remoteId: string, email: string): Promise<string> => {
    const known = await plannedSubmissions({ kernel: site.kernel });
    receiver.add({ id: remoteId, answers: { email, message: `Hello from ${remoteId}` }, submittedAt: "2026-10-20T09:00:00.000Z" });
    const pulled = await site.deps.formSubmissionsPull!.pull({ workspaceId: site.deps.workspaceId });
    assert.equal(pulled.ran, true);
    assert.deepEqual(pulled.forms, [{ formId: FORM_ID, formSlug: FORM_SLUG, imported: 1, alreadyImported: 0, unmapped: 0, failed: 0 }]);
    return awaitNewPlan({ kernel: site.kernel, known });
  };
  const receivedEventOf = async (submissionId: string): Promise<DomainEvent> => {
    const row = (await outboxRows({ kernel: site.kernel })).find((entry) => entry.event.name === "form.submission.received" && entry.event.aggregateId === submissionId);
    assert.ok(row, `the received event of ${submissionId} is in the outbox`);
    return row.event;
  };
  const jobState = async (submissionId: string) => (await deliveryJobs({ kernel: site.kernel, submissionId })).map((row) => [row.id, row.status, row.attempts, row.job]);

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-delivery-slice-"));
    home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-delivery-home-"));
    restoreEnv = isolateSiteEnvironment({ home });
    removeHook = installFixtureHook({ receiver, destinations });
    site = await bootSite({ dir });
    await installFixturePlugin({ deps: site.deps });
    connections = await seedSite({ deps: site.deps });
    await writeBindings({ deps: site.deps, bindings: originalBindings(connections) });
    // `createApp` attaches every site subscriber, the delivery planner and deliverer among them.
    createApp(site.deps);
  });

  after(async () => {
    try {
      await site?.close();
    } finally {
      removeHook();
      restoreEnv();
      if (dir) await removeSiteDir({ dir });
      if (home) fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("a submission pulled from the receiver is planned once, with one frozen job per matching binding", async () => {
    first.submissionId = await pullOne("remote-1", "ada@example.com");
    assert.deepEqual(receiver.acked, ["remote-1"]);

    const jobs = await deliveryJobs({ kernel: site.kernel, submissionId: first.submissionId });
    assert.deepEqual(jobs.map((row) => [row.job.binding.bindingId, row.job.binding.adapterId, row.status, row.attempts]),
      [["binding-a", PUSH_A, "pending", 0], ["binding-b", PUSH_B, "pending", 0]]);
    first.jobIdA = jobs[0]!.id;
    first.jobIdB = jobs[1]!.id;
    for (const { job } of jobs) {
      assert.equal(job.idempotencyKey, JSON.stringify([first.submissionId, job.binding.bindingId]));
      assert.deepEqual(job.snapshot.submission, { id: first.submissionId, answers: { email: "ada@example.com", message: "Hello from remote-1" }, submittedAt: "2026-10-20T09:00:00.000Z" });
      assert.deepEqual(job.snapshot.form.fields.map((field) => [field.name, field.label, field.type]), [["email", "Email", "email"], ["message", "Message", "textarea"]]);
    }
    assert.deepEqual(jobs.map(({ job }) => job.binding.config), [{ table: "leads" }, { sheet: "Leads" }]);
    assert.deepEqual(await plannedSubmissions({ kernel: site.kernel }), [first.submissionId]);
    assert.equal(destinations.calls.length, 0, "planning delivers nothing by itself");
  });

  test("drain 1: A completes, B is retrying with its next retry time and safe error code", async () => {
    destinations.script({ adapterId: PUSH_B, submissionId: first.submissionId, results: [{ ok: false, error: { code: "rate-limited", retryable: true, retryAfterMs: RETRY_AFTER_MS } }] });

    assert.equal(await drain(), 2);

    assert.deepEqual(await status(first.submissionId), [
      { bindingId: "binding-a", adapterId: PUSH_A, formId: FORM_ID, submissionId: first.submissionId, status: "completed", attempts: 1, nextRetryAt: null, errorCode: null },
      // The adapter's 10 minutes beat the webhook schedule's first step (2.5 minutes at random 0).
      { bindingId: "binding-b", adapterId: PUSH_B, formId: FORM_ID, submissionId: first.submissionId, status: "retrying", attempts: 1, nextRetryAt: "2030-01-01T00:10:00.000Z", errorCode: "rate-limited" },
    ]);
    const [callA] = destinations.callsFor({ adapterId: PUSH_A, submissionId: first.submissionId });
    assert.equal(callA?.input.credential.token, fixtureToken({ name: "rows-a" }), "A's credential is resolved from its connectionRef");
    assert.equal(destinations.callsFor({ adapterId: PUSH_B, submissionId: first.submissionId }).length, 1);
  });

  test("drain 2 after the wait: B completes with the same job id, idempotency key and frozen payload, and A is not called again", async () => {
    clock.advanceMs(RETRY_AFTER_MS - 1);
    assert.equal(await drain(), 0, "B is not due one millisecond early");
    clock.advanceMs(1);
    assert.equal(await drain(), 1);

    const callsB = destinations.callsFor({ adapterId: PUSH_B, submissionId: first.submissionId });
    assert.equal(callsB.length, 2);
    assert.equal(callsB[1]!.input.idempotencyKey, JSON.stringify([first.submissionId, "binding-b"]));
    assert.deepEqual(callsB[1]!.input, callsB[0]!.input, "the retry sees the identical frozen form, submission, binding, key and credential");
    assert.equal(destinations.callsFor({ adapterId: PUSH_A, submissionId: first.submissionId }).length, 1);
    const jobs = await deliveryJobs({ kernel: site.kernel, submissionId: first.submissionId });
    assert.deepEqual(jobs.map((row) => [row.id, row.status, row.attempts]), [[first.jobIdA, "delivered", 1], [first.jobIdB, "delivered", 2]]);
    assert.deepEqual((await status(first.submissionId)).map((row) => [row.bindingId, row.status, row.attempts, row.nextRetryAt, row.errorCode]),
      [["binding-a", "completed", 1, null, null], ["binding-b", "completed", 2, null, null]]);
  });

  test("replaying form.submission.received adds no plan and no job", async () => {
    const before = await jobState(first.submissionId);
    const callsBefore = destinations.calls.length;

    await site.deps.bus.publish(await receivedEventOf(first.submissionId));

    assert.deepEqual(await plannedSubmissions({ kernel: site.kernel }), [first.submissionId]);
    assert.deepEqual(await jobState(first.submissionId), before);
    assert.equal(await drain(), 0);
    assert.equal(destinations.calls.length, callsBefore);
  });

  test("editing the bindings after planning changes nothing for an already planned submission", async () => {
    const before = await jobState(first.submissionId);
    const callsBefore = destinations.calls.length;
    await writeBindings({ deps: site.deps, bindings: [
      { bindingId: "binding-b", adapterId: PUSH_B, connectionRef: connections.connectionB, enabled: false, config: { sheet: "Other" } },
      { bindingId: "binding-c", adapterId: PUSH_A, connectionRef: connections.connectionA, enabled: true, config: { table: "late" } },
    ] });
    try {
      await site.deps.bus.publish(await receivedEventOf(first.submissionId));
      assert.deepEqual(await jobState(first.submissionId), before);
      assert.equal(await drain(), 0);
      assert.equal(destinations.calls.length, callsBefore);
    } finally {
      await writeBindings({ deps: site.deps, bindings: originalBindings(connections) });
    }
  });

  test("a non-retryable failure goes terminal at once and is never retried", async () => {
    const submissionId = await pullOne("remote-2", "grace@example.com");
    destinations.script({ adapterId: PUSH_B, submissionId, results: [{ ok: false, error: { code: "configuration-invalid", retryable: false } }] });

    assert.equal(await drain(), 2);
    assert.deepEqual((await status(submissionId)).map((row) => [row.bindingId, row.status, row.attempts, row.nextRetryAt, row.errorCode]),
      [["binding-a", "completed", 1, null, null], ["binding-b", "failed", 1, null, "configuration-invalid"]]);

    clock.advanceMs(48 * 60 * 60_000);
    assert.equal(await drain(), 0);
    assert.equal(destinations.callsFor({ adapterId: PUSH_B, submissionId }).length, 1);
  });

  test("restart: a new worker over the same database delivers a job a crashed worker had claimed, once its lease expires", async () => {
    const submissionId = await pullOne("remote-3", "linus@example.com");
    const planned = (await deliveryJobs({ kernel: site.kernel, submissionId })).map((row) => row.id);
    // A worker claims both jobs and dies before recording any outcome.
    const claimed = await site.deps.outbox.claimPending({ batchSize: 20, nowIso: clock.nowIso() });
    assert.deepEqual(claimed.map((row) => row.id).sort(), [...planned].sort());
    await site.close();

    site = await bootSite({ dir });
    createApp(site.deps);
    assert.equal(await drain(), 0, "the dead worker's lease still holds");
    clock.advanceMs(DEFAULT_OUTBOX_CLAIM_LEASE_MS);
    assert.equal(await drain(), 2);

    for (const adapterId of [PUSH_A, PUSH_B]) {
      const calls = destinations.callsFor({ adapterId, submissionId });
      assert.equal(calls.length, 1, `${adapterId} delivered once`);
      assert.equal(calls[0]!.input.idempotencyKey, JSON.stringify([submissionId, adapterId === PUSH_A ? "binding-a" : "binding-b"]));
    }
    const jobs = await deliveryJobs({ kernel: site.kernel, submissionId });
    assert.deepEqual(jobs.map((row) => [row.id, row.status, row.attempts]), [[planned[0], "delivered", 2], [planned[1], "delivered", 2]]);
  });
});

describe("automatic pull: the autoPull setting, startup and sign-in triggers, and the receiver lease", () => {
  // Created in `before`, so a run filtered to the other suite leaves no folder behind.
  let dir = "";
  let home = "";
  const receiver = new FakeReceiver();
  const destinations = new FakePushDestinations();
  let site: FixtureSite;
  let restoreEnv = (): void => undefined;
  let removeHook = (): void => undefined;

  /** Starts the serving app (startup pull included) and returns its stop. */
  const serve = () => {
    const serving = createServingApp(site.deps, { outboxDrainIntervalMs: 60_000 });
    const stop = async () => {
      await serving.formPullTrigger.stop();
      await serving.outboxDrainer.stop();
      serving.trashSweeper.stop({});
      serving.themeWatcher.stop();
      await Promise.allSettled(serving.bootWork);
    };
    return { app: serving.app, stop, stopFormPull: () => serving.formPullTrigger.stop() };
  };
  const leaseRows = () => site.kernel.run((db) => db.selectFrom("form_receiver_pulls").select(["receiver_key", "lease_token", "lease_expires_at"]).execute());

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-autopull-"));
    home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-form-autopull-home-"));
    restoreEnv = isolateSiteEnvironment({ home });
    removeHook = installFixtureHook({ receiver, destinations });
    site = await bootSite({ dir });
    await installFixturePlugin({ deps: site.deps });
    await seedSite({ deps: site.deps });
  });

  after(async () => {
    try {
      await site?.close();
    } finally {
      removeHook();
      restoreEnv();
      if (dir) await removeSiteDir({ dir });
      if (home) fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("autoPull OFF: neither the serving startup nor an owner sign-in pulls", async (t) => {
    await writeAutoPull({ deps: site.deps, value: false });
    receiver.add({ id: "remote-off", answers: { email: "off@example.com" }, submittedAt: "2026-10-20T10:00:00.000Z" });
    const counted = countAutoPulls({ deps: site.deps });
    const serving = serve();
    t.after(async () => { await serving.stop(); counted.restore(); });

    await waitFor({ what: "the startup trigger", check: async () => (counted.settled() === 1 ? true : undefined) });
    await loginAsOwner(await startTestServer(serving.app, t));
    await waitFor({ what: "the sign-in trigger", check: async () => (counted.settled() === 2 ? true : undefined) });

    assert.equal(receiver.pulls, 0);
    assert.deepEqual([...receiver.pending.keys()], ["remote-off"]);
    assert.deepEqual(await leaseRows(), [], "no pull was even admitted");
  });

  test("autoPull ON: one pull at startup, and an owner sign-in within 60 s pulls nothing", async (t) => {
    await writeAutoPull({ deps: site.deps, value: true });
    const counted = countAutoPulls({ deps: site.deps });
    const serving = serve();
    t.after(async () => { await serving.stop(); counted.restore(); });

    await waitFor({ what: "the startup trigger", check: async () => (counted.settled() === 1 ? true : undefined) });
    assert.equal(receiver.pulls, 1);
    assert.deepEqual(receiver.acked, ["remote-off"]);
    await awaitReceivedSettled({ kernel: site.kernel });

    receiver.add({ id: "remote-on", answers: { email: "on@example.com" }, submittedAt: "2026-10-20T10:01:00.000Z" });
    await loginAsOwner(await startTestServer(serving.app, t));
    await waitFor({ what: "the sign-in trigger", check: async () => (counted.settled() === 2 ? true : undefined) });

    assert.equal(receiver.pulls, 1, "the sign-in came under a minute after the startup pull started");
    assert.deepEqual([...receiver.pending.keys()], ["remote-on"]);
    assert.deepEqual(await leaseRows(), [{ receiver_key: `fixture-host:${RECEIVER_URL}`, lease_token: null, lease_expires_at: null }]);
  });

  test("once the serving app's form pull trigger has stopped, an owner sign-in starts no pull", async (t) => {
    const counted = countAutoPulls({ deps: site.deps });
    const serving = serve();
    t.after(async () => { await serving.stop(); counted.restore(); });
    await waitFor({ what: "the startup trigger", check: async () => (counted.settled() === 1 ? true : undefined) });

    await serving.stopFormPull();
    await loginAsOwner(await startTestServer(serving.app, t));
    // The sign-in signal runs after a background role lookup; give it ample time to reach the trigger.
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(counted.settled(), 1, "the stopped trigger refused the sign-in pull");
  });

  test("a manual pull while another pull of the same receiver is in flight answers already-running", async () => {
    const pullsBefore = receiver.pulls;
    const held = receiver.hold();
    const firstPull = site.deps.formSubmissionsPull!.pull({ workspaceId: site.deps.workspaceId });
    await held.entered;

    const second = await site.deps.formSubmissionsPull!.pull({ workspaceId: site.deps.workspaceId });
    held.release();
    const firstResult = await firstPull;
    await awaitReceivedSettled({ kernel: site.kernel });

    assert.equal(second.ran, false);
    assert.equal(second.ran === false ? second.reason : undefined, "already-running");
    assert.deepEqual(second.totals, { imported: 0, alreadyImported: 0, unmapped: 0, failed: 0 });
    assert.equal(receiver.pulls, pullsBefore + 1, "the refused pull never reached the receiver");
    assert.equal(firstResult.ran, true);
    assert.deepEqual(firstResult.totals, { imported: 1, alreadyImported: 0, unmapped: 0, failed: 0 });
  });
});
