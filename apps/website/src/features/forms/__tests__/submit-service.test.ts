import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { FormDefinitionNotFoundError, FormRateLimitExceededError, FormSubmissionValidationError } from "@jini-ai/cms-forms";
import { FORMS_SUBMIT_PROFILE } from "../rate-limit-profile.js";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory.js";
import { duplicateSubmissionId, DUPLICATE_SUBMISSION_WINDOW_MS, submitForm } from "../submit-service.js";
import type { DomainEvent } from "@jini-ai/cms/core";
import type { FormDefinitionRecord } from "@jini-ai/cms-forms";

/**
 * @file Integration-style tests for `submitForm` (C-008, REQ-05..09/16, AC-08/09/10/13/14/15/24,
 * INV-01/04/05/07, EC-09) against real (in-memory) contracts — honeypot silent-discard with
 * identical response shape, payload validation rejects, rate-limit rejects, accepted submission
 * persists + enqueues exactly once, and the fire-and-forget timing assertion (AC-24/INV-05).
 */

const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "ws-1";

function makeDefinition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "def-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [
      { id: "name", label: "Name", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: true },
    ],
    notify: { enabled: false, recipients: [] },
    version: 1,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDeps() {
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowMs: () => Date.parse(NOW) };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const rateLimiter = createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock });
  return { definitionRepo, submissionRepo, outbox, bus, clock, idGen, rateLimiter };
}

test("submitForm: AC-07/REQ-05 — accepts a valid submission to an active form", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  const result = await submitForm({
    deps,
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "1.1.1.1" },
  });
  assert.equal(result.status, "accepted");
});

test("submitForm: AC-15/REQ-10 — persists the submission with field values, source IP, timestamp", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  await submitForm({
    deps,
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "1.1.1.1" },
  });

  const page = await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.items[0].data, { name: "Ada", email: "ada@example.com" });
  assert.equal(page.items[0].sourceIp, "1.1.1.1");
  assert.equal(page.items[0].submittedAt, NOW);
});

test("submitForm: AC-11/REQ-07 — rejects a nonexistent slug with FormDefinitionNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      submitForm({
        deps,
        input: { workspaceId: WORKSPACE_ID, slug: "nope", body: {}, sourceIp: "1.1.1.1" },
      }),
    FormDefinitionNotFoundError
  );
});

test("submitForm: AC-12/REQ-07/EC-03 — rejects a disabled slug with the identical FormDefinitionNotFoundError", async () => {
  const deps = makeDeps();
  let missingMessage: string | undefined;
  await assert.rejects(() => submitForm({ deps, input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "1.1.1.1" } }), (error: unknown) => {
    assert.ok(error instanceof FormDefinitionNotFoundError);
    missingMessage = error.message;
    return true;
  });
  await deps.definitionRepo.create(makeDefinition({ status: "disabled" }));
  await assert.rejects(
    () =>
      submitForm({
        deps,
        input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "1.1.1.1" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof FormDefinitionNotFoundError);
      assert.equal(error.message, missingMessage);
      return true;
    }
  );
});

test("submitForm: AC-08/09/10 — rejects an invalid payload with FormSubmissionValidationError, nothing persisted", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  await assert.rejects(
    () =>
      submitForm({
        deps,
        input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada" }, sourceIp: "1.1.1.1" },
      }),
    FormSubmissionValidationError
  );

  const page = await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
  assert.equal(page.items.length, 0);
});

test("submitForm: AC-13/INV-04 — a honeypot-tripped submission returns accepted but persists nothing and enqueues nothing", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  const result = await submitForm({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      slug: "contact",
      body: { name: "Ada", email: "ada@example.com", _hp: "i-am-a-bot" },
      sourceIp: "1.1.1.1",
    },
  });
  assert.equal(result.status, "accepted");

  const page = await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
  assert.equal(page.items.length, 0);

  const claimed = await deps.outbox.claimPending({ batchSize: 20, nowIso: NOW });
  assert.equal(claimed.length, 0);
});

test("submitForm: EC-09 — a whitespace-only honeypot field is treated as normal (not tripped)", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  const result = await submitForm({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      slug: "contact",
      body: { name: "Ada", email: "ada@example.com", _hp: "   " },
      sourceIp: "1.1.1.1",
    },
  });
  assert.equal(result.status, "accepted");

  const page = await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
  assert.equal(page.items.length, 1);
});

test("submitForm: AC-14/REQ-09 — the 6th submission in-window from the same (ip, formId) is rate-limited", async () => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());
  const body = { name: "Ada", email: "ada@example.com" };

  for (let i = 0; i < 5; i++) {
    const result = await submitForm({
      deps,
      input: { workspaceId: WORKSPACE_ID, slug: "contact", body, sourceIp: "2.2.2.2" },
    });
    assert.equal(result.status, "accepted");
  }

  await assert.rejects(
    () => submitForm({ deps, input: { workspaceId: WORKSPACE_ID, slug: "contact", body, sourceIp: "2.2.2.2" } }),
    FormRateLimitExceededError
  );
});

test("submitForm: INV-07 — enqueues exactly one form.submission.received event per accepted submission", { timeout: 2000 }, async (t) => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  const received: DomainEvent<unknown>[] = [];
  const enqueued: DomainEvent[] = [];
  const enqueue = deps.outbox.enqueue.bind(deps.outbox);
  t.mock.method(deps.outbox, "enqueue", async (event: DomainEvent) => { enqueued.push(structuredClone(event)); await enqueue(event); });
  let delivered!: () => void;
  const delivery = new Promise<void>((resolve) => { delivered = resolve; });
  const markDelivered = deps.outbox.markDelivered.bind(deps.outbox);
  t.mock.method(deps.outbox, "markDelivered", async (input: { id: string }) => { await markDelivered(input); delivered(); });
  await deps.bus.subscribe({ eventName: "form.submission.received", handler: async (event) => {
    received.push(event);
  } });

  await submitForm({
    deps,
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "1.1.1.1" },
  });

  await delivery;

  assert.equal(enqueued.length, 1);
  assert.deepEqual(received, enqueued);
  const page = await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 10 });
  assert.equal(page.items.length, 1);
  const submission = page.items[0]!;
  assert.deepEqual(received[0], { id: "id-1", name: "form.submission.received", workspaceId: WORKSPACE_ID, aggregateId: submission.id, occurredAt: NOW, payload: { workspaceId: WORKSPACE_ID, formDefinitionId: submission.formDefinitionId, submissionId: submission.id } });
});

test("submitForm: AC-24/INV-05 — the response resolves before a slow/throwing subscriber settles (fire-and-forget outbox drain)", { timeout: 2000 }, async (t) => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());

  let subscriberSettled = false;
  let entered!: () => void;
  const subscriberEntered = new Promise<void>((resolve) => { entered = resolve; });
  let settled!: () => void;
  const subscriberDone = new Promise<void>((resolve) => { settled = resolve; });
  let releaseSubscriber: () => void = () => {};
  const hang = new Promise<void>((resolve) => {
    releaseSubscriber = resolve;
  });
  await deps.bus.subscribe({ eventName: "form.submission.received", handler: async () => {
    entered();
    await hang;
    subscriberSettled = true;
    settled();
    throw new Error("simulated slow/throwing MailerPort.send()");
  } });

  t.after(() => releaseSubscriber());
  const result = await submitForm({
    deps,
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "ada@example.com" }, sourceIp: "3.3.3.3" },
  });

  assert.equal(result.status, "accepted");
  await subscriberEntered;
  assert.equal(subscriberSettled, false, "submitForm must not wait for the subscriber to settle");

  releaseSubscriber();
  await subscriberDone;
  assert.equal(subscriberSettled, true, "the subscriber eventually runs, just not before the response");
});

// ---------------------------------------------------------------------------
// Double-submit dedupe: a double-clicked Send (two POSTs of the same body from the same visitor)
// must store ONE submission and answer both with the same accepted result.
// ---------------------------------------------------------------------------

async function storedSubmissions(deps: ReturnType<typeof makeDeps>) {
  return (await deps.submissionRepo.listByDefinition({ workspaceId: WORKSPACE_ID, formDefinitionId: "def-1", limit: 50 })).items;
}

function makeClockedDeps(startMs: number) {
  const deps = makeDeps();
  let nowMs = startMs;
  const clock = { nowMs: () => nowMs };
  return { deps: { ...deps, clock, rateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }) }, advance: (ms: number) => { nowMs += ms; } };
}

const ADA = { name: "Ada", email: "ada@example.com" };

test("submitForm: a double-submitted body (same visitor, same form) stores one row, one event, and answers both alike", async (t) => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());
  const enqueued: DomainEvent[] = [];
  const enqueue = deps.outbox.enqueue.bind(deps.outbox);
  t.mock.method(deps.outbox, "enqueue", async (event: DomainEvent) => { enqueued.push(event); await enqueue(event); });
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" };

  const results = await Promise.all([submitForm({ deps, input }), submitForm({ deps, input })]);

  assert.deepEqual(results, [{ status: "accepted" }, { status: "accepted" }]);
  const rows = await storedSubmissions(deps);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.data, ADA);
  assert.deepEqual(enqueued.map((e) => e.aggregateId), [rows[0]!.id]);
});

test("submitForm: the stored row and its event carry the derived id; the event id still comes from idGen", async (t) => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());
  const enqueued: DomainEvent[] = [];
  const enqueue = deps.outbox.enqueue.bind(deps.outbox);
  t.mock.method(deps.outbox, "enqueue", async (event: DomainEvent) => { enqueued.push(event); await enqueue(event); });
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" };

  await submitForm({ deps, input });

  const id = duplicateSubmissionId({ input, windowIndex: Math.floor(Date.parse(NOW) / DUPLICATE_SUBMISSION_WINDOW_MS) });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual((await storedSubmissions(deps)).map((row) => row.id), [id]);
  assert.deepEqual(enqueued.map((e) => [e.id, e.aggregateId, (e.payload as { submissionId: string }).submissionId]), [["id-1", id, id]]);
});

test("duplicateSubmissionId: body key order does not matter; every other input does", () => {
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada", email: "a@x.io" }, sourceIp: "4.4.4.4" };
  const id = duplicateSubmissionId({ input, windowIndex: 7 });
  assert.equal(duplicateSubmissionId({ input: { ...input, body: { email: "a@x.io", name: "Ada" } }, windowIndex: 7 }), id);
  for (const other of [
    { input: { ...input, workspaceId: "ws-2" }, windowIndex: 7 },
    { input: { ...input, slug: "other" }, windowIndex: 7 },
    { input: { ...input, sourceIp: "5.5.5.5" }, windowIndex: 7 },
    { input: { ...input, body: { name: "Ada", email: "b@x.io" } }, windowIndex: 7 },
    { input, windowIndex: 8 },
  ]) assert.notEqual(duplicateSubmissionId(other), id);
});

test("submitForm: a double submit straddling a window boundary is still one row", async () => {
  const { deps, advance } = makeClockedDeps(DUPLICATE_SUBMISSION_WINDOW_MS * 1000 - 100);
  await deps.definitionRepo.create(makeDefinition());
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" };

  await submitForm({ deps, input });
  advance(200);
  assert.deepEqual(await submitForm({ deps, input }), { status: "accepted" });

  assert.equal((await storedSubmissions(deps)).length, 1);
});

test("submitForm: the same body again after the window, or a different body, or another visitor, is a new row", async () => {
  const { deps, advance } = makeClockedDeps(DUPLICATE_SUBMISSION_WINDOW_MS * 1000);
  await deps.definitionRepo.create(makeDefinition());
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" };

  await submitForm({ deps, input });
  await submitForm({ deps, input: { ...input, body: { ...ADA, name: "Grace" } } });
  await submitForm({ deps, input: { ...input, sourceIp: "5.5.5.5" } });
  advance(DUPLICATE_SUBMISSION_WINDOW_MS * 2);
  await submitForm({ deps, input });

  assert.equal((await storedSubmissions(deps)).length, 4);
});

test("submitForm: a custom duplicateWindowMs sets the window", async () => {
  const { deps, advance } = makeClockedDeps(0);
  await deps.definitionRepo.create(makeDefinition());
  const input = { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" };

  await submitForm({ deps, input }, { duplicateWindowMs: 1000 });
  advance(2000);
  await submitForm({ deps, input }, { duplicateWindowMs: 1000 });

  assert.equal((await storedSubmissions(deps)).length, 2);
});

test("submitForm: a repo failure other than a duplicate still propagates", async (t) => {
  const deps = makeDeps();
  await deps.definitionRepo.create(makeDefinition());
  t.mock.method(deps.submissionRepo, "createOnce", async () => { throw new Error("disk full"); });

  await assert.rejects(
    () => submitForm({ deps, input: { workspaceId: WORKSPACE_ID, slug: "contact", body: ADA, sourceIp: "4.4.4.4" } }),
    /disk full/
  );
});

test("submitForm: a refused request never reaches the id derivation (no clock read)", async () => {
  const deps = { ...makeDeps(), clock: { nowMs: (): number => assert.fail("clock must not be read") } };

  await assert.rejects(
    () => submitForm({ deps, input: { workspaceId: WORKSPACE_ID, slug: "missing", body: ADA, sourceIp: "4.4.4.4" } }),
    FormDefinitionNotFoundError
  );
});
