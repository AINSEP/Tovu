import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "../../core/events";
import type { DomainEvent } from "@jini-ai/cms/core";
import type { MailerPort, MailerSendOptions, MailerSendResult, OutboundEmail } from "../../mail";
import { registerFormNotifySubscriber } from "../notify-subscriber";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory";
import type { FormDefinitionRecord, FormSubmissionRecord } from "../types";

/**
 * @file Unit tests for `registerFormNotifySubscriber` (C-009, REQ-12, AC-17/18, EC-06).
 * Notify-enabled definition -> MailerPort.send() invoked per recipient with an idempotencyKey
 * built from submissionId; notify-disabled -> never invoked; a SUPPRESSED mailer result is
 * logged, not thrown.
 */

const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "ws-1";

class RecordingMailer implements MailerPort {
  readonly calls: Array<{ message: OutboundEmail; opts: MailerSendOptions }> = [];
  result: MailerSendResult = { ok: true, providerMessageId: "msg-1", acceptedAt: NOW };

  capabilities() {
    return { driver: "recording", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false };
  }
  async send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult> {
    this.calls.push({ message, opts });
    return this.result;
  }
  async sendBatch(messages: readonly OutboundEmail[], opts: MailerSendOptions) {
    const results: MailerSendResult[] = [];
    for (const m of messages) results.push(await this.send(m, opts));
    return results;
  }
}

function makeDefinition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "def-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<FormSubmissionRecord> = {}): FormSubmissionRecord {
  return {
    id: "sub-1",
    workspaceId: WORKSPACE_ID,
    formDefinitionId: "def-1",
    data: { name: "Ada" },
    sourceIp: "127.0.0.1",
    submittedAt: NOW,
    ...overrides,
  };
}

function publishSubmissionEvent(bus: InMemoryEventBus, submissionId: string, formDefinitionId = "def-1") {
  const event: DomainEvent<{ workspaceId: string; formDefinitionId: string; submissionId: string }> = {
    id: `evt-${submissionId}`,
    name: "form.submission.received",
    occurredAt: NOW,
    workspaceId: WORKSPACE_ID,
    payload: { workspaceId: WORKSPACE_ID, formDefinitionId, submissionId },
  };
  return bus.publish(event);
}

test("registerFormNotifySubscriber: AC-17 — invokes MailerPort.send() for a notify-enabled definition with an idempotencyKey built from submissionId", async () => {
  const bus = new InMemoryEventBus();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const mailer = new RecordingMailer();

  await definitionRepo.create(
    makeDefinition({ notify: { enabled: true, recipients: ["ops@example.com"] } })
  );
  await submissionRepo.create(makeSubmission());

  await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo: definitionRepo, formSubmissionRepo: submissionRepo });
  await publishSubmissionEvent(bus, "sub-1");

  assert.equal(mailer.calls.length, 1);
  assert.equal(mailer.calls[0].message.to.email, "ops@example.com");
  assert.ok(mailer.calls[0].opts.idempotencyKey.includes("sub-1"));
});

test("registerFormNotifySubscriber: AC-18 — never invokes MailerPort.send() when notify is disabled", async () => {
  const bus = new InMemoryEventBus();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const mailer = new RecordingMailer();

  await definitionRepo.create(makeDefinition({ notify: { enabled: false, recipients: [] } }));
  await submissionRepo.create(makeSubmission());

  await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo: definitionRepo, formSubmissionRepo: submissionRepo });
  await publishSubmissionEvent(bus, "sub-1");

  assert.equal(mailer.calls.length, 0);
});

test("registerFormNotifySubscriber: invokes send() once per configured recipient", async () => {
  const bus = new InMemoryEventBus();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const mailer = new RecordingMailer();

  await definitionRepo.create(
    makeDefinition({ notify: { enabled: true, recipients: ["a@example.com", "b@example.com"] } })
  );
  await submissionRepo.create(makeSubmission());

  await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo: definitionRepo, formSubmissionRepo: submissionRepo });
  await publishSubmissionEvent(bus, "sub-1");

  assert.equal(mailer.calls.length, 2);
  assert.deepEqual(
    mailer.calls.map((c) => c.message.to.email).sort(),
    ["a@example.com", "b@example.com"]
  );
});

test("registerFormNotifySubscriber: EC-06 — a SUPPRESSED mailer result is logged, not thrown, and does not crash the subscriber", async () => {
  const bus = new InMemoryEventBus();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const mailer = new RecordingMailer();
  mailer.result = { ok: false, retryable: false, errorCode: "SUPPRESSED", message: "recipient suppressed" };

  await definitionRepo.create(
    makeDefinition({ notify: { enabled: true, recipients: ["ops@example.com"] } })
  );
  await submissionRepo.create(makeSubmission());

  await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo: definitionRepo, formSubmissionRepo: submissionRepo });
  // Should not throw / reject.
  await assert.doesNotReject(() => publishSubmissionEvent(bus, "sub-1"));
  assert.equal(mailer.calls.length, 1);
});

test("registerFormNotifySubscriber: a throwing MailerPort.send() is caught, never propagated into the bus", async () => {
  const bus = new InMemoryEventBus();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const mailer = new RecordingMailer();
  mailer.send = async () => {
    throw new Error("provider is down");
  };

  await definitionRepo.create(
    makeDefinition({ notify: { enabled: true, recipients: ["ops@example.com"] } })
  );
  await submissionRepo.create(makeSubmission());

  await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo: definitionRepo, formSubmissionRepo: submissionRepo });
  await assert.doesNotReject(() => publishSubmissionEvent(bus, "sub-1"));
});
