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
import type { Logger } from "@jini-ai/core/primitives";
// Subscriber/dedup rationale: Jini/packages/cms/forms/src/notify-subscriber.ts (SPEC-010, ADR-037, SPEC-022).
import {
  registerFormNotifySubscriber as registerPackageSubscriber,
  type FormDefinitionRepoPort,
} from "@jini-ai/cms-forms";
import type { EventBusPort } from "@jini-ai/cms/core";
import type { MailerPort } from "../../platform/mail/index.js";
import { adaptFormSubmissionRepo, type FormSubmissionRepoPort } from "./ports.js";

export interface RegisterFormNotifySubscriberDeps {
  bus: EventBusPort;
  mailer: MailerPort;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
}

/**
 * Binds the Tovu sender and positional mail port to Jini's notification subscriber.
 * @returns Async unsubscribe; repository/delivery errors are logged by the package.
 * @complexity O(r) sends per submission, with r bounded by the definition recipient cap.
 * @example const unsubscribe = await registerFormNotifySubscriber({ bus, mailer, formDefinitionRepo, formSubmissionRepo });
 */
export function registerFormNotifySubscriber(
  deps: RegisterFormNotifySubscriberDeps,
  { logger = { warn: ({ message }, { error } = {}) => console.warn(message, ...(error === undefined ? [] : [error])) } }: { logger?: Pick<Logger, "warn"> } = {},
): Promise<() => Promise<void>> {
  return registerPackageSubscriber({
    bus: deps.bus,
    sender: { email: "no-reply@forms.local", name: "Forms" },
    logger,
    mailer: { send: ({ message, options }) => deps.mailer.send(message, options) },
    formDefinitionRepo: deps.formDefinitionRepo,
    formSubmissionRepo: adaptFormSubmissionRepo({ repo: deps.formSubmissionRepo }),
  });
}
