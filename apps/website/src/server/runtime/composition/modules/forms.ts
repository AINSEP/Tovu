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
import { registerFormNotifySubscriber, type FormDefinitionRepoPort, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import type { EventBusPort } from "@jini-ai/cms/core";
import { mailSenderIdentityFor, type MailerPort, type MailSenderIdentityPort } from "#src/platform/mail/index";
import type { ServerModuleHandle } from "./types.js";

export interface FormsModuleDeps {
  bus: EventBusPort;
  tracker: Tracker;
  mailer: MailerPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  visitorAnalyticsDeliveryAllowed?: import('#src/server/inbound/public-http/visitor-analytics').VisitorAnalyticsDeps['visitorAnalyticsDeliveryAllowed'];
  /** Resolves each notification's From (`platform/mail/sender-identity.ts`); absent, the placeholder
   *  is used only while `mailer` is non-delivering. */
  senderIdentity?: MailSenderIdentityPort;
}

/** Placeholder From for a non-delivering mailer; real providers get the site's configured sender. */
const FORMS_FALLBACK_SENDER = { email: "no-reply@forms.local", name: "Forms" } as const;

/**
 * @file ADR-046 Phase 3 (SPEC-031) — the `forms` module: owns starting the C-009 notify
 * subscriber (`registerFormNotifySubscriber`, SPEC-010/ADR-PIPE-010 W-004) — Forms' own,
 * business-logic subscription to `form.submission.received`. The SIBLING webhook-fanout
 * subscription to the same event is deliberately NOT here — see `modules/integrations.ts`'s file
 * header for why cross-feature integration is Integrations' job, not Forms'.
 */
export function createFormsModule(deps: FormsModuleDeps): ServerModuleHandle {
  return {
    name: "forms",
    start: () => {
      void deps.bus.subscribe<{ workspaceId: string; formDefinitionId: string; deliveryMode?: string;
        analyticsProvenance?: import('#src/features/forms/index').FormAnalyticsProvenance }>({
        eventName: "form.submission.received",
        handler: async (event) => {
          const proof = event.payload.analyticsProvenance;
          if (proof?.granted !== true || !proof.subjectId) return;
          if (!proof.consentProof || !await deps.visitorAnalyticsDeliveryAllowed?.({ proof: proof.consentProof })) return;
          const definition = await deps.formDefinitionRepo.findById({ workspaceId: event.payload.workspaceId, id: event.payload.formDefinitionId });
          if (!definition) return;
          // The provider dedupes retries with this committed domain event id; no form answers leave.
          deps.tracker.capture({ name: "form_submitted", userId: proof.subjectId, properties: {
            eventId: event.id, formId: definition.id,
            deliveryMode: event.payload.deliveryMode === "remote_import" ? "remote_import" : "live",
          } });
        },
      });
      const senderIdentity = mailSenderIdentityFor({ mailer: deps.mailer }, { senderIdentity: deps.senderIdentity });
      void registerFormNotifySubscriber({
        ...deps,
        // The Jini subscriber takes one fixed sender, but the From is per workspace and read fresh
        // per send, so the mailer seam below replaces it. A `SenderIdentityNotConfiguredError` thrown
        // there is logged by the subscriber as a failed send, like any other send failure.
        sender: FORMS_FALLBACK_SENDER,
        logger: { warn: ({ message }, { error } = {}) => console.warn(message, ...(error === undefined ? [] : [error])) },
        mailer: {
          send: async ({ message, options }) => {
            const from = await senderIdentity.resolve({ workspaceId: message.workspaceId, fallback: FORMS_FALLBACK_SENDER });
            return deps.mailer.send({ ...message, from }, options);
          },
        },
      }, {});
    },
  };
}
