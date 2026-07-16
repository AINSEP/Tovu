import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCoreModule } from "../../modules/core";
import { createFormsModule } from "../../modules/forms";
import { createIntegrationsModule } from "../../modules/integrations";
import { InMemoryEventBus } from "../../../core/events";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../../../forms/repo.memory";
import { ConsoleMailerAdapter } from "../../../members/mailer.console";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../../../integrations";
import { setReadinessSnapshot, getReadinessSnapshot } from "../../readiness-state";
import { startTestServer } from "../helpers/http-test-server";

/**
 * @file SPEC-031 (ADR-046 Phase 3) — unit coverage for the `ServerModuleHandle` factories,
 * proving the split-out `forms`/`integrations` subscription ownership still fires end-to-end
 * (a fired `form.submission.received` event still produces a webhook delivery row), and that
 * `core`'s routes still register correctly, matching pre-Phase-3 `app.ts` behavior exactly.
 */

test("createCoreModule().registerRoutes wires /health, /healthz, /readyz", async (t) => {
  setReadinessSnapshot({ ok: true, modules: [] });
  const app = express();
  createCoreModule().registerRoutes?.(app);
  const baseUrl = await startTestServer(app, t);

  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/readyz`)).status, 200);
});

test("createIntegrationsModule().start() enqueues a webhook delivery when a form.submission.received event fires", async () => {
  const bus = new InMemoryEventBus();
  const webhookSubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  const nowIso = "2026-07-16T00:00:00.000Z";
  const clock = { nowIso: () => nowIso };
  const idGen = { newId: () => "delivery-1" };

  await webhookSubscriptionRepo.save({
    id: "sub-1",
    workspaceId: "workspace-1",
    ownerPrincipalId: "principal-1",
    label: "Endpoint",
    targetUrl: "https://example.com/hooks",
    topics: ["form.submission.received"],
    secretVersion: 1,
    previousSecretVersion: null,
    status: "active",
    createdByPrincipalId: "principal-1",
    createdByPluginId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    disabledAt: null,
  });

  createIntegrationsModule({ bus, webhookSubscriptionRepo, webhookDeliveryRepo, idGen, clock }).start?.();

  await bus.publish({
    id: "evt-1",
    name: "form.submission.received",
    workspaceId: "workspace-1",
    occurredAt: nowIso,
    payload: { workspaceId: "workspace-1", formDefinitionId: "def-1", submissionId: "sub-1" },
  });

  // The subscriber's own enqueueDelivery() call is awaited inside the bus's publish loop —
  // the enqueued row is immediately due, so claimPending surfaces it without a wait.
  const claimed = await webhookDeliveryRepo.claimPending({ batchSize: 10, nowIso });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].subscriptionId, "sub-1");
});

test("createFormsModule().start() registers the C-009 notify subscriber without throwing", () => {
  const bus = new InMemoryEventBus();
  const handle = createFormsModule({
    bus,
    mailer: new ConsoleMailerAdapter(),
    formDefinitionRepo: new InMemoryFormDefinitionRepo([]),
    formSubmissionRepo: new InMemoryFormSubmissionRepo([]),
  });
  assert.equal(handle.name, "forms");
  assert.doesNotThrow(() => handle.start?.());
});

test("readiness-state getter/setter round-trips (used by /readyz and the module-status route)", () => {
  const snapshot = { ok: false, modules: [{ name: "x", owner: "y", criticality: "critical" as const, lifecycle: { status: "failed" as const, reasonCode: "r", remediationHint: "h" } }] };
  setReadinessSnapshot(snapshot);
  assert.deepEqual(getReadinessSnapshot(), snapshot);
  setReadinessSnapshot({ ok: true, modules: [] }); // restore default for subsequent tests in this process
});
