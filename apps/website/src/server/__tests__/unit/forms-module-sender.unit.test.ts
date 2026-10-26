import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { InMemoryEventBus } from "#src/contracts/core/events/index";
import { createMailSenderIdentityResolver, type MailerPort, type MailerSendOptions, type OutboundEmail } from "#src/platform/mail/index";

import { createFormsModule } from "../../runtime/composition/modules/forms.js";

/**
 * @file The `forms` module's notification From: resolved per workspace through the shared
 * sender-identity resolver at send time, replacing the Jini subscriber's fixed sender. A missing
 * sender on a delivering mailer is logged as a failed send, never thrown into the event bus.
 */

const NOW = "2026-10-21T00:00:00.000Z";
const WS = "ws-forms-sender";

function recordingMailer(driver: string): { mailer: MailerPort; sends: { message: OutboundEmail; options: MailerSendOptions }[] } {
  const sends: { message: OutboundEmail; options: MailerSendOptions }[] = [];
  const mailer: MailerPort = {
    capabilities: () => ({ driver, supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message, options) => { sends.push({ message, options }); return { ok: true, providerMessageId: "m1", acceptedAt: NOW }; },
    sendBatch: async () => [],
  };
  return { mailer, sends };
}

/** Starts the module over one notify-enabled form with one submission, then fires the event. */
async function fireSubmission(required: { mailer: MailerPort }, optional: { senderIdentity?: Parameters<typeof createFormsModule>[0]["senderIdentity"] } = {}) {
  const bus = new InMemoryEventBus();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  await formDefinitionRepo.create({
    id: "form-1", workspaceId: WS, name: "Contact", slug: "contact", fields: [],
    notify: { enabled: true, recipients: ["ops@example.com"] }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW,
  });
  await formSubmissionRepo.create({ id: "submission-1", workspaceId: WS, formDefinitionId: "form-1", data: { name: "Ada" }, sourceIp: "127.0.0.1", submittedAt: NOW });
  createFormsModule({ tracker: createTracker({}), bus, mailer: required.mailer, formDefinitionRepo, formSubmissionRepo, ...optional }).start?.();
  // `start()` subscribes asynchronously; let the subscription land before publishing.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await bus.publish({ id: "event-1", name: "form.submission.received", workspaceId: WS, occurredAt: NOW, payload: { workspaceId: WS, formDefinitionId: "form-1", submissionId: "submission-1" } });
}

test("a form notification is sent from the site's configured sender, read for the submission's workspace", async () => {
  const { mailer, sends } = recordingMailer("smtp");
  const reads: string[] = [];
  const senderIdentity = createMailSenderIdentityResolver({ mailer }, {
    readConfiguredSender: async ({ workspaceId }) => { reads.push(workspaceId); return { email: "forms@example.com", name: "Example Site" }; },
  });
  await fireSubmission({ mailer }, { senderIdentity });
  assert.deepEqual(reads, [WS]);
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0]!.message.from, { email: "forms@example.com", name: "Example Site" });
  assert.equal(sends[0]!.message.to.email, "ops@example.com", "the rest of the Jini-built message passes through unchanged");
  assert.equal(sends[0]!.options.lane, "notification");
});

test("without a composed resolver a non-delivering mailer keeps the no-reply@forms.local placeholder", async () => {
  const { mailer, sends } = recordingMailer("console");
  await fireSubmission({ mailer });
  assert.deepEqual(sends[0]!.message.from, { email: "no-reply@forms.local", name: "Forms" });
});

test("a delivering mailer with no sender sends nothing and the refusal is logged by the subscriber", async (t) => {
  const { mailer, sends } = recordingMailer("smtp");
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  await fireSubmission({ mailer });
  assert.equal(sends.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]![0]), /mail send threw for submission 'submission-1'/);
  assert.match(String(warnings[0]![1]), /SenderIdentityNotConfiguredError/);
});

test("a provider's { ok: false } result is logged with its message alone", async (t) => {
  const { mailer } = recordingMailer("smtp");
  mailer.send = async () => ({ ok: false, retryable: false, errorCode: "REJECTED_SENDER", message: "sender refused" });
  const senderIdentity = createMailSenderIdentityResolver({ mailer }, { readConfiguredSender: async () => ({ email: "forms@example.com" }) });
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  await fireSubmission({ mailer }, { senderIdentity });
  assert.deepEqual(warnings, [["[forms:notify] mail send failed for submission 'submission-1' recipient 'ops@example.com': REJECTED_SENDER (sender refused)"]]);
});
