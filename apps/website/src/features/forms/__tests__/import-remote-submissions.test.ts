import assert from "node:assert/strict";
import test from "node:test";

import type { FormDefinitionRecord, FormSubmissionRecord } from "@jini-ai/cms/forms";
import { importRemoteFormSubmissions, type ImportRemoteSubmissionsDeps, type RemoteSubmissionInput } from "../import-remote-submissions.js";

/** @file Unit tests for importing submissions a static host stored, with in-memory ports. */

const base = { workspaceId: "w", name: "Waitlist", notify: { enabled: true, recipients: [] }, createdAt: "t", updatedAt: "t", version: 1 };
const waitlist: FormDefinitionRecord = { ...base, id: "f1", slug: "waitlist", status: "active", fields: [
  { id: "email", label: "Email", type: "email", required: true, maxLength: 254 },
  { id: "note", label: "Note", type: "textarea", required: false, maxLength: 5 },
] };
const disabled: FormDefinitionRecord = { ...waitlist, id: "f2", slug: "old", status: "disabled" };

function setup({ failCreateOn }: { failCreateOn?: string } = {}) {
  const rows: FormSubmissionRecord[] = [];
  const events: { name: string; aggregateId: string; payload: unknown }[] = [];
  const receipts = new Map<string, string>();
  const lookups: string[] = [];
  let ids = 0;
  const deps: ImportRemoteSubmissionsDeps = {
    definitionRepo: { findBySlug: async ({ slug }) => { lookups.push(slug); return [waitlist, disabled].find((d) => d.slug === slug) ?? null; } },
    submissionRepo: {
      create: async (record) => { if (record.data.email === failCreateOn) throw new Error("disk full"); rows.push(record); },
      // Rolls back every write made inside `work` when it throws, like the store's real transaction.
      transaction: async (work) => {
        const snapshot = { rows: rows.length, events: events.length, receipts: new Map(receipts) };
        try { return await work(); } catch (error) {
          rows.length = snapshot.rows; events.length = snapshot.events; receipts.clear();
          for (const [key, value] of snapshot.receipts) receipts.set(key, value);
          throw error;
        }
      },
    },
    receipts: { claim: async ({ workspaceId, destinationKey, remoteId, submissionId }) => {
      const key = `${workspaceId}|${destinationKey}|${remoteId}`;
      if (receipts.has(key)) return false;
      receipts.set(key, submissionId);
      return true;
    } },
    outbox: { enqueue: async (event) => { events.push(event as never); } },
    clock: { nowMs: () => Date.parse("2026-10-19T12:00:00.000Z") },
    idGen: { newId: () => `id-${++ids}` },
  };
  return { deps, rows, events, receipts, lookups };
}

const row = (id: string, answers: Record<string, unknown>, extra: Partial<RemoteSubmissionInput> = {}): RemoteSubmissionInput =>
  ({ id, formSlug: "waitlist", answers, submittedAt: "2026-10-19T10:00:00.000Z", ip: "203.0.113.9", ...extra });

test("valid rows become submissions with one received event each, keeping the host's time and IP", async () => {
  const s = setup();
  const result = await importRemoteFormSubmissions({ deps: s.deps, workspaceId: "w", destinationKey: "host:https://a.example", items: [row("r1", { email: "a@b.co", note: "hi" })] });
  assert.deepEqual(result, { committedIds: ["r1"], imported: 1, duplicates: 0, invalid: [], skipped: [] });
  assert.deepEqual(s.rows, [{ id: "id-1", workspaceId: "w", formDefinitionId: "f1", data: { email: "a@b.co", note: "hi" }, sourceIp: "203.0.113.9", submittedAt: "2026-10-19T10:00:00.000Z" }]);
  assert.deepEqual(s.events, [{ id: "id-2", name: "form.submission.received", occurredAt: "2026-10-19T12:00:00.000Z", workspaceId: "w", aggregateId: "id-1", payload: { workspaceId: "w", formDefinitionId: "f1", submissionId: "id-1" } }]);
});

test("a row seen again (same destination and remote id) is acknowledged as a duplicate and writes nothing", async () => {
  const s = setup();
  const input = { deps: s.deps, workspaceId: "w", destinationKey: "host:https://a.example", items: [row("r1", { email: "a@b.co" })] };
  await importRemoteFormSubmissions(input);
  const again = await importRemoteFormSubmissions({ ...input, items: [row("r1", { email: "a@b.co" }), row("r1", { email: "a@b.co" })] });
  assert.deepEqual(again, { committedIds: ["r1", "r1"], imported: 0, duplicates: 2, invalid: [], skipped: [] });
  assert.equal(s.rows.length, 1);
  assert.equal(s.events.length, 1, "notifications fire once");
  const other = await importRemoteFormSubmissions({ ...input, destinationKey: "host:https://b.example" });
  assert.equal(other.imported, 1, "another destination's remote id is a different row");
});

test("rows the live validator rejects are imported with declared text fields only and listed with their errors", async () => {
  const s = setup();
  const result = await importRemoteFormSubmissions({ deps: s.deps, workspaceId: "w", destinationKey: "d", items: [
    row("r1", { email: "", note: "too long", extra: "x" }, { submittedAt: "not a date", ip: null }),
    row("r2", { email: ["a", "b"], note: 7 }),
  ] });
  assert.equal(result.imported, 2);
  assert.deepEqual(result.invalid.map(({ remoteId, submissionId }) => [remoteId, submissionId]), [["r1", "id-1"], ["r2", "id-3"]]);
  assert.ok(result.invalid[0]!.fieldErrors.some((error) => error.field === "extra"), "unknown keys are reported");
  assert.deepEqual(s.rows.map((stored) => stored.data), [{ email: "", note: "too long" }, { email: ["a", "b"] }]);
  assert.equal(s.rows[0]!.submittedAt, "2026-10-19T12:00:00.000Z", "an unusable host time falls back to the import time");
  assert.equal(s.rows[0]!.sourceIp, null);
});

test("rows for a form that no longer exists are skipped and not acknowledged; a disabled form still imports", async () => {
  const s = setup();
  const result = await importRemoteFormSubmissions({ deps: s.deps, workspaceId: "w", destinationKey: "d", items: [
    row("r1", { email: "a@b.co" }, { formSlug: "gone" }), row("r2", { email: "a@b.co" }, { formSlug: "gone" }), row("r3", { email: "a@b.co" }, { formSlug: "old" }),
  ] });
  assert.deepEqual(result.skipped, [{ remoteId: "r1", formSlug: "gone", reason: "unknown_form" }, { remoteId: "r2", formSlug: "gone", reason: "unknown_form" }]);
  assert.deepEqual(result.committedIds, ["r3"]);
  assert.deepEqual(s.lookups, ["gone", "old"], "each slug is looked up once per page");
});

test("a failed write rolls back that row's receipt and event, stops the page and leaves earlier rows committed", async () => {
  const s = setup({ failCreateOn: "bad@b.co" });
  await assert.rejects(importRemoteFormSubmissions({ deps: s.deps, workspaceId: "w", destinationKey: "d", items: [
    row("r1", { email: "a@b.co" }), row("r2", { email: "bad@b.co" }), row("r3", { email: "c@b.co" }),
  ] }), /disk full/);
  assert.deepEqual(s.rows.map((stored) => stored.data.email), ["a@b.co"]);
  assert.equal(s.events.length, 1);
  assert.deepEqual([...s.receipts.keys()], ["w|d|r1"], "the failed row can be retried");
});

test("without a store transaction the writes still run in order", async () => {
  const s = setup();
  const { transaction: _omit, ...plain } = s.deps.submissionRepo;
  const result = await importRemoteFormSubmissions({ deps: { ...s.deps, submissionRepo: plain }, workspaceId: "w", destinationKey: "d", items: [row("r1", { email: "a@b.co" })] });
  assert.equal(result.imported, 1);
});
