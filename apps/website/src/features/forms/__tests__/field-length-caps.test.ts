/** Public form length caps (owner 2026-10-25): the submit path refuses over-long text per field. */
import assert from "node:assert/strict";
import test from "node:test";
import { FormSubmissionValidationError, InMemoryFormSubmissionRepo, type FieldDescriptor, type FormDefinitionRecord } from "@jini-ai/cms/forms";
import { InMemoryEventBus } from "../../../contracts/core/events/index.js";
import { submitForm } from "../index.js";

const FIELDS: FieldDescriptor[] = [
  { id: "name", label: "Name", type: "text", required: false },
  { id: "message", label: "Message", type: "textarea", required: false },
  { id: "code", label: "Code", type: "text", required: false, maxLength: 5 },
  { id: "bio", label: "Bio", type: "text", required: false, maxLength: 300 },
  { id: "topic", label: "Topic", type: "select", required: false, options: [{ value: "sales", label: "Sales" }] },
];

function submitter() {
  const definition = { id: "def-1", workspaceId: "ws", name: "Contact", slug: "contact", fields: FIELDS, status: "active", version: 1 } as unknown as FormDefinitionRecord;
  let id = 0;
  const deps = {
    crypto: globalThis.crypto, // the Jini submit-form deps take the crypto port explicitly
    definitionRepo: { findBySlug: async () => definition }, submissionRepo: new InMemoryFormSubmissionRepo(),
    clock: { nowMs: () => 1000 }, idGen: { newId: () => `id-${++id}` }, bus: new InMemoryEventBus(),
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
    rateLimiter: { check: async () => ({ allowed: true as const }) },
  } as unknown as Parameters<typeof submitForm>[0]["deps"];
  return (body: Record<string, unknown>) => submitForm({ deps, input: { workspaceId: "ws", slug: "contact", sourceIp: "127.0.0.1", body } });
}

async function fieldErrors(submit: ReturnType<typeof submitter>, body: Record<string, unknown>) {
  try {
    await submit(body);
    return [];
  } catch (error) {
    assert.ok(error instanceof FormSubmissionValidationError, String(error));
    return error.fieldErrors;
  }
}

test("published receiver preserves the live wrapper's code-point boundaries for emoji", async () => {
  const receiver = await import(import.meta.resolve("@jini-ai/agent-plugins/cloudflare/worker/forms-receiver.mjs"));
  const submit = submitter();
  for (const value of ["😀".repeat(5), "a😀😀😀😀", "😀".repeat(6)]) {
    const liveErrors = await fieldErrors(submit, { code: value });
    const remote = receiver.checkFields({ form: { fields: [{ name: "code", type: "text", required: false, maxLength: 5 }] }, fields: new Map([["code", [value]]]) });
    assert.equal(Boolean(remote.error), liveErrors.length > 0, value);
    if (!remote.error) assert.equal(remote.answers.code, value);
  }
});
