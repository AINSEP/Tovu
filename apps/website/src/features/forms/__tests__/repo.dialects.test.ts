import { FORMS_TABLES } from "#src/features/forms/repo.sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { FormSlugConflictError } from "@jini-ai/cms/forms";
import { InMemoryEventBus } from "#src/contracts/core/events/index";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { FORMS_SUBMIT_PROFILE } from "../rate-limit-profile.js";
import { formDefinitionRepoFor, formSubmissionRepoFor } from "@jini-ai/cms/forms/sql";
import { submitForm } from "#src/features/forms/index";
import { outboxFor } from "#src/platform/db/repos/outbox-repo";
import type { FormDefinitionRecord, FormSubmissionRecord } from "@jini-ai/cms/forms";

/**
 * @file Both forms repos on every dialect through the kernel's matrix (`describeEachDialect` + ONE
 * factory: one query body serves every dialect). Covers every public method: hit, miss,
 * other-workspace isolation, trashed-row handling and rollback.
 */

const WS = "ws-dialects";
const OTHER = "ws-other";
const T0 = "2026-09-28T00:00:00.000Z";

function definition(id: string, slug: string, overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id,
    workspaceId: WS,
    name: `Form ${slug}`,
    slug,
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: true, recipients: ["a@example.com"] },
    status: "active",
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function submission(id: string, submittedAt: string, overrides: Partial<FormSubmissionRecord> = {}): FormSubmissionRecord {
  return {
    id,
    workspaceId: WS,
    formDefinitionId: "def-1",
    data: { name: `n-${id}`, agree: true },
    sourceIp: "203.0.113.9",
    submittedAt,
    ...overrides,
  };
}

function repos(kernel: ContentKernel) {
  return { kernel, defs: formDefinitionRepoFor({ kernel: kernel, tables: FORMS_TABLES }, {}), subs: formSubmissionRepoFor({ kernel: kernel, tables: FORMS_TABLES }, {}) };
}

describeEachDialect(
  "forms repos",
  { tables: ["form_definitions", "form_submissions", "outbox_events"], make: repos },
  (makeRepos) => {
    const trash = (kernel: ContentKernel, table: "form_definitions" | "form_submissions", id: string) =>
      kernel.run((db) => db.updateTable(table).set({ deleted_at: T0 }).where("id", "=", id).execute());

    test("transaction rolls a submission back with the event write that failed after it, and commits both on success", async () => {
      const { kernel, defs, subs } = makeRepos();
      await defs.create(definition("def-1", "contact"));
      const outbox = outboxFor(kernel);
      const event = (id: string, submissionId: string) => ({
        id, name: "form.submission.received", occurredAt: T0, workspaceId: WS, aggregateId: submissionId,
        payload: { workspaceId: WS, formDefinitionId: "def-1", submissionId },
      });
      await assert.rejects(
        () => subs.transaction(async () => {
          await subs.create(submission("s1", T0));
          await outbox.enqueue(event("e1", "s1"));
          throw new Error("enqueue failed after the write");
        }),
        { message: "enqueue failed after the write" },
      );
      assert.equal(await subs.findById({ workspaceId: WS, id: "s1" }), null);
      assert.equal((await kernel.run((db) => db.selectFrom("outbox_events").select("id").execute())).length, 0);

      await subs.transaction(async () => {
        await subs.create(submission("s1", T0));
        await outbox.enqueue(event("e1", "s1"));
      });
      assert.deepEqual(await subs.findById({ workspaceId: WS, id: "s1" }), submission("s1", T0));
      assert.deepEqual((await kernel.run((db) => db.selectFrom("outbox_events").select("event_json").execute())).map((row) => (JSON.parse(row.event_json) as { aggregateId: string }).aggregateId), ["s1"]);
    });

    test("submitForm: a failed enqueue leaves no row; the retry of that attempt stores the row and its event", async () => {
      const { kernel, defs, subs } = makeRepos();
      await defs.create(definition("def-1", "contact"));
      const clock = { nowMs: () => Date.parse(T0) };
      let n = 0;
      const realOutbox = outboxFor(kernel);
      let failNext = true;
      const outbox = Object.assign(Object.create(realOutbox) as typeof realOutbox, {
        enqueue: async (event: Parameters<typeof realOutbox.enqueue>[0]) => {
          if (failNext) { failNext = false; throw new Error("outbox unavailable"); }
          await realOutbox.enqueue(event);
        },
      });
      const deps = {
        definitionRepo: defs, submissionRepo: subs, outbox, bus: new InMemoryEventBus(), clock,
        idGen: { newId: () => `id-${++n}` }, rateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
      };
      const input = { workspaceId: WS, slug: "contact", body: { name: "Ada", _attempt: "tok-1" }, sourceIp: "203.0.113.9" };

      await assert.rejects(() => submitForm({ deps, input }), { message: "outbox unavailable" });
      assert.equal((await kernel.run((db) => db.selectFrom("form_submissions").select("id").execute())).length, 0);

      assert.deepEqual(await submitForm({ deps, input }), { status: "accepted" });
      const rows = await kernel.run((db) => db.selectFrom("form_submissions").select(["id", "data_json"]).execute());
      assert.equal(rows.length, 1);
      const events = await kernel.run((db) => db.selectFrom("outbox_events").select("event_json").execute());
      assert.deepEqual(events.map((row) => (JSON.parse(row.event_json) as { aggregateId: string }).aggregateId), [rows[0]!.id]);
      assert.deepEqual(JSON.parse(rows[0]!.data_json), { name: "Ada" }, "the attempt token is never stored");
    });

    test("submitForm: two concurrent POSTs of one attempt store exactly one row and answer both the same", async () => {
      const { kernel, defs, subs } = makeRepos();
      await defs.create(definition("def-1", "contact"));
      const clock = { nowMs: () => Date.parse(T0) };
      let n = 0;
      const deps = {
        definitionRepo: defs, submissionRepo: subs, outbox: outboxFor(kernel), bus: new InMemoryEventBus(), clock,
        idGen: { newId: () => `id-${++n}` }, rateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
      };
      const input = { workspaceId: WS, slug: "contact", body: { name: "Ada", _attempt: "tok-1" }, sourceIp: "203.0.113.9" };
      const results = await Promise.all([submitForm({ deps, input }), submitForm({ deps, input })]);
      assert.deepEqual(results, [{ status: "accepted" }, { status: "accepted" }]);
      const rows = await kernel.run((db) => db.selectFrom("form_submissions").selectAll().execute());
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.id, /^id-\d$/, "an idGen id, not one derived from the visitor");
      const events = await kernel.run((db) => db.selectFrom("outbox_events").select("event_json").execute());
      assert.deepEqual(events.map((row) => (JSON.parse(row.event_json) as { aggregateId: string }).aggregateId), [rows[0]!.id]);
    });
  }
);
