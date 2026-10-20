import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormDeliveryJob, type FormDeliveryPlan, type FormDeliveryPlanPort } from "@jini-ai/cms/forms";
import { InMemorySettingsRepo, type AuthorizeFn } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemoryEventBus } from "#src/contracts/core/events/index";
import { createSettingsPrincipalLookup, ensureFormDeliverySettings, writeFormDeliveryBindings } from "#src/features/settings/index";
import { composeFormDelivery, type FormDeliveryCompositionDeps } from "../form-delivery.js";

/**
 * @file `composeFormDelivery` on its own, over in-memory repos: what the planner freezes from the
 * site's forms (labelled fields and stored answers, never the source IP), which sources count as
 * gone (an empty plan and one log line), and that each child job reaches `deliver` with its
 * workspace. The bus-ordering and retry consequences are `form-delivery-subscribers.test.ts`'s.
 */

const W = "ws-1";
const T0 = "2026-10-20T12:00:00.000Z";
const SOURCE_IP = "203.0.113.7";

async function settingsSelectingEveryForm(): Promise<InMemorySettingsRepo> {
  const clock = { nowMs: () => Date.parse(T0), nowIso: () => T0 };
  let next = 0;
  const ids = { newId: () => `setting-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  await writeFormDeliveryBindings({ deps: { repo: settingsRepo, clock, ids, authorize, principals }, workspaceId: W, callerPrincipalId: "owner",
    value: [{ bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, config: { table: "leads" } }] });
  return settingsRepo;
}

/** Two forms; `sub-1` belongs to `form-1` and carries a source IP the snapshot must drop. */
async function seededForms(): Promise<Pick<FormDeliveryCompositionDeps, "formDefinitionRepo" | "formSubmissionRepo">> {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  const base = { workspaceId: W, status: "active" as const, version: 1, createdAt: T0, updatedAt: T0, notify: { enabled: true, recipients: ["owner@example.com"] } };
  await formDefinitionRepo.create({ ...base, id: "form-1", name: "Contact", slug: "contact",
    fields: [{ id: "email", label: "Email", type: "email", required: true, maxLength: 254 }, { id: "message", label: "Message", type: "textarea", required: false }] });
  await formDefinitionRepo.create({ ...base, id: "form-2", name: "Waitlist", slug: "waitlist", fields: [{ id: "email", label: "Email", type: "email", required: true }] });
  await formSubmissionRepo.create({ id: "sub-1", workspaceId: W, formDefinitionId: "form-1", data: { email: "visitor@example.com", message: "Hello" },
    sourceIp: SOURCE_IP, submittedAt: T0 });
  return { formDefinitionRepo, formSubmissionRepo };
}

/** Composed delivery with a plan store that records every plan its `build` returns. */
async function composed(
  forms: Pick<FormDeliveryCompositionDeps, "formDefinitionRepo" | "formSubmissionRepo">,
  optional: { warn?: (message: string) => void; deliver?: FormDeliveryCompositionDeps["deliver"] } = {},
) {
  const bus = new InMemoryEventBus();
  const recorded: FormDeliveryPlan[] = [];
  const plans: FormDeliveryPlanPort = { once: async ({ build }) => { const plan = await build(); recorded.push(plan); return plan; } };
  let next = 0;
  const delivery = composeFormDelivery({ bus, plans, settingsRepo: await settingsSelectingEveryForm(), ...forms,
    deliver: optional.deliver ?? (async () => undefined), idGen: { newId: () => `job-${(next += 1)}` }, clock: { nowIso: () => T0 } },
  optional.warn ? { warn: optional.warn } : {});
  await delivery.start();
  return { bus, recorded };
}

const received = (submissionId: string, formId: string): DomainEvent => ({ id: `evt-${submissionId}`, name: "form.submission.received", workspaceId: W,
  occurredAt: T0, aggregateId: submissionId, payload: { submissionId, formDefinitionId: formId } });

test("the frozen job carries the form's fields with labels and types and the stored answers, never the source IP", async () => {
  const { bus, recorded } = await composed(await seededForms());

  await bus.publish(received("sub-1", "form-1"));

  assert.equal(recorded.length, 1);
  const [plan] = recorded;
  assert.deepEqual([plan!.workspaceId, plan!.submissionId, plan!.formId], [W, "sub-1", "form-1"]);
  assert.deepEqual(plan!.jobs.map((job) => [job.id, job.name, job.workspaceId, job.occurredAt]), [["job-1", "form.submission.delivery", W, T0]]);
  assert.deepEqual(plan!.jobs[0]!.payload.snapshot, {
    form: { slug: "contact", fields: [
      { name: "email", required: true, maxLength: 254, label: "Email", type: "email" },
      { name: "message", required: false, label: "Message", type: "textarea" },
    ] },
    submission: { id: "sub-1", answers: { email: "visitor@example.com", message: "Hello" }, submittedAt: T0 },
  });
  assert.ok(!JSON.stringify(plan).includes(SOURCE_IP), "the source IP is in no part of the plan");
});

test("a submission named under a form it does not belong to records an empty plan", async () => {
  const warnings: string[] = [];
  const { bus, recorded } = await composed(await seededForms(), { warn: (message) => warnings.push(message) });

  await bus.publish(received("sub-1", "form-2"));

  assert.deepEqual(recorded, [{ workspaceId: W, submissionId: "sub-1", formId: "form-2", jobs: [] }]);
  assert.deepEqual(warnings, ["[form-delivery] submission sub-1 or its form no longer exists; recorded an empty delivery plan"]);
});

test("a form deleted before planning records an empty plan, logged to console.warn when no warn is given", async (t: TestContext) => {
  const warned: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warned.push(line); });
  const forms = await seededForms();
  const { bus, recorded } = await composed({ ...forms, formDefinitionRepo: { findById: async () => null } });

  await bus.publish(received("sub-1", "form-1"));

  assert.deepEqual(recorded, [{ workspaceId: W, submissionId: "sub-1", formId: "form-1", jobs: [] }]);
  assert.deepEqual(warned, ["[form-delivery] submission sub-1 or its form no longer exists; recorded an empty delivery plan"]);
});

test("each child job reaches deliver with its own workspace and the frozen job", async () => {
  const delivered: { workspaceId: string; job: FormDeliveryJob }[] = [];
  const { bus, recorded } = await composed(await seededForms(), { deliver: async (input) => { delivered.push(input); } });
  await bus.publish(received("sub-1", "form-1"));
  const [job] = recorded[0]!.jobs;

  await bus.publish(job!);

  assert.deepEqual(delivered, [{ workspaceId: W, job: job!.payload }]);
});
