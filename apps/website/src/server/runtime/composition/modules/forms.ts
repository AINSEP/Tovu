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
import type { EventBusPort } from "@jini-ai/cms/core";
import type { MailerPort } from "#src/platform/mail/index";
import type { ServerModuleHandle } from "./types.js";

export interface FormsModuleDeps {
  bus: EventBusPort;
  mailer: MailerPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
}

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
      void registerFormNotifySubscriber({
        ...deps,
        sender: { email: "no-reply@forms.local", name: "Forms" },
        logger: { warn: ({ message }, { error } = {}) => console.warn(message, ...(error === undefined ? [] : [error])) },
        mailer: { send: ({ message, options }) => deps.mailer.send(message, options) },
      }, {});
    },
  };
}
