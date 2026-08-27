import type { DomainEvent, EventBusPort } from "@jini-ai/cms/core";
import type { MailerPort } from "../../mail/index.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports.js";

/**
 * @file `registerFormNotifySubscriber` — the Forms-owned outbox subscriber (SPEC-010 REQ-12,
 * ADR-PIPE-010 C-009).
 *
 * Purpose:
 * Subscribes `form.submission.received`; on a notify-enabled definition, calls `MailerPort.send()`
 * per configured recipient. The one piece of Forms-owned business logic riding the outbox — kept
 * separate from the webhook-fanout forwarding (which is not Forms-owned logic; see
 * `server/app.ts`'s wiring). A send failure (thrown or `{ ok: false }`) is logged, never thrown
 * back into `EventBusPort.publish()`'s subscriber loop (`core/events/memory-bus.ts`'s `publish`
 * does not catch handler errors itself — a subscriber that fails to catch its own errors would
 * break every OTHER subscriber to the same event, including the webhook fan-out).
 *
 * Deliberately duplicates the `'form.submission.received'` topic-name literal rather than
 * importing it from `./manifest` — see `types.ts`'s file header for why domain code never reads
 * the manifest back.
 */

const FORM_SUBMISSION_RECEIVED_TOPIC = "form.submission.received";

interface FormSubmissionReceivedPayload {
  workspaceId: string;
  formDefinitionId: string;
  submissionId: string;
}

export interface RegisterFormNotifySubscriberDeps {
  bus: EventBusPort;
  mailer: MailerPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
}

/**
 * Registers the C-009 subscriber. Returns the bus's async unsubscribe function (per
 * `EventBusPort.subscribe`'s contract) — called once at boot (`server/app.ts`).
 *
 * @complexity O(r) over the definition's configured recipients.
 * @overallScore 100
 */
export async function registerFormNotifySubscriber(
  deps: RegisterFormNotifySubscriberDeps
): Promise<() => Promise<void>> {
  return deps.bus.subscribe<FormSubmissionReceivedPayload>(
    FORM_SUBMISSION_RECEIVED_TOPIC,
    async (event: DomainEvent<FormSubmissionReceivedPayload>) => {
      try {
        const { workspaceId, formDefinitionId, submissionId } = event.payload;

        const definition = await deps.formDefinitionRepo.findById({ workspaceId, id: formDefinitionId });
        if (!definition || !definition.notify.enabled || definition.notify.recipients.length === 0) {
          return;
        }

        const submission = await deps.formSubmissionRepo.findById({ workspaceId, id: submissionId });
        if (!submission) return;

        for (const recipient of definition.notify.recipients) {
          try {
            const result = await deps.mailer.send(
              {
                workspaceId,
                to: { email: recipient },
                from: { email: "no-reply@forms.local", name: "Forms" },
                subject: `New submission: ${definition.name}`,
                text: JSON.stringify(submission.data),
              },
              {
                // ADR-037 amendment 1 — idempotencyKey built from submissionId, per-recipient so
                // a shared mail-lib dedup ledger never suppresses a second recipient's send.
                idempotencyKey: `forms:notify:${submissionId}:${recipient}`,
                workspaceId,
                sourceContext: { module: "forms", ref: formDefinitionId },
                purpose: "transactional",
                // SPEC-022 REQ-09/REQ-10: notification lane — gated on durable-outbox
                // readiness in production mode (unlike members' interactive-lane send).
                lane: "notification",
              }
            );
            if (!result.ok) {
              console.warn(
                `[forms:notify] mail send failed for submission '${submissionId}' recipient '${recipient}': ${result.errorCode} (${result.message})`
              );
            }
          } catch (err) {
            // EC-06/REQ-12 — a failed send is terminal, logged, never retried inline, and never
            // affects the submission row itself.
            console.warn(
              `[forms:notify] mail send threw for submission '${submissionId}' recipient '${recipient}':`,
              err
            );
          }
        }
      } catch (err) {
        // Defensive outer guard — even a repo-read failure must never propagate into
        // `publish()`'s subscriber loop and break sibling subscribers (e.g. the webhook fan-out).
        console.warn("[forms:notify] subscriber failed:", err);
      }
    }
  );
}
