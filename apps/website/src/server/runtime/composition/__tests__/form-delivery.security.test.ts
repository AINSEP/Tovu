import assert from "node:assert/strict";
import { test } from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormDeliveryResult } from "@jini-ai/cms/forms";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo, type AuthorizeFn } from "@jini-ai/core/settings";
import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, processOutbox } from "#src/contracts/core/events/index";
import { buildFormDestinationRegistry, createFormDestinationDeliverer, type FormDeliveryConnectionPort, type FormDestinationKit } from "#src/features/form-destinations/index";
import { buildFormsRegistrations } from "#src/features/forms/tool-registrations";
import { createSettingsPrincipalLookup, ensureFormDeliverySettings, writeFormDeliveryBindings } from "#src/features/settings/index";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { Kysely } from "kysely";
import { SqlFormDeliveryRepo } from "#src/platform/db/repos/form-delivery-repo";
import { SqlOutboxAdapter } from "#src/platform/db/repos/outbox-repo";
import { composeFormDelivery } from "../form-delivery.js";

/**
 * @file Phase-A security pins for the composed delivery path, on SQLite and PGlite with the real
 * plan store, outbox and status reads: whatever an adapter throws or returns, only an allowlisted
 * code reaches the outbox ledger, the status read and `forms_delivery_status`; a frozen job holds
 * neither the credential nor the source IP; a missing credential fails the binding at once; and
 * status reads stay inside the caller's workspace.
 */

const W = "ws-a";
const T0 = "2026-10-20T12:00:00.000Z";
const SOURCE_IP = "203.0.113.9";
// Built at runtime so no secret-shaped literal is committed.
const TOKEN = `tok-${"z".repeat(24)}`;
const ANSWER = "visitor@example.com";
const LEAK = `${TOKEN} https://rows.example.com/private ${ANSWER}`;
const ALLOWED_CODES = new Set(["authorization-required", "rate-limited", "configuration-invalid", "mapping-invalid", "resource-not-granted",
  "destination-limit", "outcome-unknown", "adapter-unavailable", "delivery-failed"]);

const kit: FormDestinationKit = { fetch: async () => new Response(null, { status: 204 }), timeouts: {} };
const clock = { nowMs: () => Date.parse(T0), nowIso: () => T0 };

/** Three push destinations: one throws a message full of secrets, one returns one, one is never given a credential. */
const registry = buildFormDestinationRegistry({ refusals: [], loaded: [
  { descriptor: { id: "throws", label: "Throws", module: "throws.mjs" }, pluginId: "p1", module: { deliver: async () => { throw new Error(LEAK); } } },
  { descriptor: { id: "returns", label: "Returns", module: "returns.mjs" }, pluginId: "p2", module: { deliver: async (): Promise<FormDeliveryResult> => {
    // An untyped plugin may add any text; only the code may survive.
    const error = { code: "rate-limited", retryable: true, message: LEAK } as const;
    return { ok: false, error };
  } } },
  { descriptor: { id: "revoked", label: "Revoked", module: "revoked.mjs" }, pluginId: "p3", module: { deliver: async () => undefined } },
] });

const connections: FormDeliveryConnectionPort = async ({ connectionRef }) => (connectionRef === "conn-revoked" ? null : { token: TOKEN, baseUrl: "https://rows.example.com" });

async function settingsWith(workspaceId: string, bindings: readonly { bindingId: string; adapterId: string; connectionRef: string }[]) {
  let next = 0;
  const ids = { newId: () => `setting-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  await writeFormDeliveryBindings({ deps: { repo: settingsRepo, clock, ids, authorize, principals }, workspaceId, callerPrincipalId: "owner",
    value: bindings.map(binding => ({ ...binding, enabled: true, config: { table: "leads" } })) });
  return settingsRepo;
}

async function seedForms(workspaceId: string) {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  await formDefinitionRepo.create({ id: "form-1", workspaceId, name: "Contact", slug: "contact", status: "active", version: 1, createdAt: T0, updatedAt: T0,
    notify: { enabled: true, recipients: ["owner@example.com"] }, fields: [{ id: "email", label: "Email", type: "email", required: true }] });
  await formSubmissionRepo.create({ id: "sub-1", workspaceId, formDefinitionId: "form-1", data: { email: ANSWER }, sourceIp: SOURCE_IP, submittedAt: T0 });
  return { formDefinitionRepo, formSubmissionRepo };
}

/** Plans one submission of `workspaceId` and runs one outbox drain over its child jobs. */
async function deliverOnce(kernel: ContentKernel, workspaceId: string) {
  const plans = new SqlFormDeliveryRepo({ kernel });
  const outbox = new SqlOutboxAdapter(kernel);
  const bus = new InMemoryEventBus();
  const forms = await seedForms(workspaceId);
  let next = 0;
  const delivery = composeFormDelivery({ bus, plans, ...forms, clock, idGen: { newId: () => `${workspaceId}-job-${(next += 1)}` },
    settingsRepo: await settingsWith(workspaceId, [
      { bindingId: "b-throws", adapterId: "throws", connectionRef: "conn-1" },
      { bindingId: "b-returns", adapterId: "returns", connectionRef: "conn-1" },
      { bindingId: "b-revoked", adapterId: "revoked", connectionRef: "conn-revoked" },
    ]),
    deliver: createFormDestinationDeliverer({ loadRegistry: async () => registry, connections, kit }),
  });
  await delivery.start();
  const received: DomainEvent = { id: `${workspaceId}-received`, name: "form.submission.received", workspaceId, occurredAt: T0, aggregateId: "sub-1",
    payload: { submissionId: "sub-1", formDefinitionId: "form-1" } };
  await bus.publish(received);
  await processOutbox({ outbox, bus, clock }, { random: () => 0 });
  return { plans, outbox };
}

/** The outbox rows of the planned child jobs (the received event's own row is not one). */
function deliveryJobRows(db: Kysely<ContentDatabase>) {
  return db.selectFrom("outbox_events as o").innerJoin("form_delivery_jobs as j", "j.job_id", "o.id").where("o.workspace_id", "=", W);
}

function statusTool(required: { workspaceId: string; plans: SqlFormDeliveryRepo; outbox: SqlOutboxAdapter }) {
  const authorize = async () => ({ allowed: true, reason: "matched" });
  const registration = buildFormsRegistrations({ executeCommand, authorize, workspaceId: required.workspaceId, clock, idGen: { newId: () => "tool-id" },
    changeSets: new InMemoryChangeSetRepo(), outbox: required.outbox, formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    formSubmissionRepo: new InMemoryFormSubmissionRepo(), formDeliveryStatus: required.plans }).find(entry => entry.descriptor.id === "forms_delivery_status");
  assert.ok(registration, "forms_delivery_status is registered");
  return (input: Record<string, unknown>) => {
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "owner" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return registration.handler(ctx);
  };
}

describeEachDialect(
  "composed form delivery security",
  {
    tables: ["form_delivery_plans", "form_delivery_jobs", "outbox_events"],
    make: (kernel: ContentKernel) => ({ kernel }),
  },
  (make) => {
    test("the outbox ledger records only allowlisted codes, whatever the adapter threw or returned", async () => {
      const { kernel } = make();
      await deliverOnce(kernel, W);
      const rows = await kernel.run(db => deliveryJobRows(db).select(["o.last_error as last_error"]).execute());
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map(row => row.last_error).sort(), ["authorization-required", "delivery-failed", "rate-limited"]);
    });

    test("a frozen delivery job holds neither the credential nor the submission's source IP", async () => {
      const { kernel } = make();
      await deliverOnce(kernel, W);
      const jobs = await kernel.run(db => deliveryJobRows(db).select(["o.event_json as event_json"]).execute());
      assert.equal(jobs.length, 3);
      for (const job of jobs) {
        assert.equal(job.event_json.includes(TOKEN), false, "no credential in the job");
        assert.equal(job.event_json.includes(SOURCE_IP), false, "no source IP in the job");
        assert.equal(job.event_json.includes('"label":"Email"'), true, "sanity: the frozen form carries field labels");
      }
    });

    test("a binding with no credential fails at once, while failing deliveries retry on the delivery schedule", async () => {
      const { kernel } = make();
      const { plans } = await deliverOnce(kernel, W);
      const byBinding = new Map((await plans.forSubmission({ workspaceId: W, submissionId: "sub-1" })).map(row => [row.bindingId, row]));
      assert.deepEqual([byBinding.get("b-revoked")?.status, byBinding.get("b-revoked")?.attempts], ["failed", 1]);
      // The webhook schedule's first step at random 0 is 2.5 minutes, not the outbox default of 15 seconds.
      assert.deepEqual([byBinding.get("b-throws")?.status, byBinding.get("b-throws")?.nextRetryAt], ["retrying", "2026-10-20T12:02:30.000Z"]);
    });

    test("forms_delivery_status returns only the reported fields with allowlisted codes, and nothing an adapter said", async () => {
      const { kernel } = make();
      const { plans, outbox } = await deliverOnce(kernel, W);
      const run = statusTool({ workspaceId: W, plans, outbox });
      for (const input of [{ submissionId: "sub-1" }, {}]) {
        const output = await run(input) as { deliveries: Record<string, unknown>[] };
        assert.equal(output.deliveries.length, 3);
        for (const row of output.deliveries) {
          assert.deepEqual(Object.keys(row).sort(), ["adapterId", "attempts", "bindingId", "errorCode", "formId", "nextRetryAt", "status", "submissionId"]);
          assert.ok(ALLOWED_CODES.has(String(row.errorCode)), `errorCode ${String(row.errorCode)} is allowlisted`);
        }
        const text = JSON.stringify(output);
        for (const secret of [TOKEN, ANSWER, "https://", SOURCE_IP]) assert.equal(text.includes(secret), false, `no ${secret} in the tool output`);
      }
    });

    test("forms_delivery_status for another workspace sees none of this workspace's deliveries", async () => {
      const { kernel } = make();
      const { plans, outbox } = await deliverOnce(kernel, W);
      const other = statusTool({ workspaceId: "ws-b", plans, outbox });
      assert.deepEqual(await other({ submissionId: "sub-1" }), { deliveries: [] });
      assert.deepEqual(await other({}), { deliveries: [] });
    });
  },
);
