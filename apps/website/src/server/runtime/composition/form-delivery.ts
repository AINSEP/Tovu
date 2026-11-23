import type { EventBusPort } from "@jini-ai/core/contracts/events";
import { submissionEvidenceDefinition, createFormDeliverySubscriptions, planFormDeliveries, type FormDefinitionRepoPort, type FormDeliveryJob,
  type FormDeliveryPlanPort, type FormDeliveryResult, type FormDeliverySnapshot, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { buildFormDeliveryForm } from "@jini-ai/cms/forms/site/form-destination-manifest";
import { readFormDeliveryBindings } from "#src/features/settings/index";

/**
 * @file Binds Jini's durable form delivery (`@jini-ai/cms/forms`: plan once per submission, one
 * outbox child job per selected binding) to this site: bindings come from the
 * `core.forms/deliveryBindings` setting, frozen form metadata from the forms repos, and each
 * referenced attempt reads its scoped submission before `deliver` (the form-destinations
 * deliverer). Nothing subscribes until `start`,
 * which the integrations module calls once per bus.
 */

export interface FormDeliveryCompositionDeps {
  readonly bus: EventBusPort;
  /** Plan-once storage that writes the plan and its child jobs in one transaction (`SqlFormDeliveryRepo`). */
  readonly plans: FormDeliveryPlanPort;
  readonly settingsRepo: SettingsRepoPort;
  readonly formDefinitionRepo: Pick<FormDefinitionRepoPort, "findById">;
  readonly formSubmissionRepo: Pick<FormSubmissionRepoPort, "findById">;
  /** One attempt of one child job (`createFormDestinationDeliverer`). */
  readonly deliver: (required: { workspaceId: string; job: FormDeliveryJob }) => Promise<FormDeliveryResult | void>;
  readonly idGen: { newId(): string };
  readonly clock: { nowIso(): string };
}

/**
 * Builds the subscriptions; `start()` is idempotent and installs the planner on
 * `form.submission.received` and the deliverer on `form.submission.delivery`.
 * A submission (or form) deleted before its event is planned records an EMPTY plan and logs one
 * line (Jini's planner option `onSourceGone: "empty-plan"`), instead of throwing: a throw fails the whole event, so the bus would re-run
 * its other subscribers (the notification email, the webhook) on every retry, for nothing.
 * @param optional.warn where that line goes (default `console.warn`).
 * @complexity O(1) to build; planning is O(bindings × formIds) per submission; each referenced
 *   attempt adds one indexed submission read, with no answer copy in the outbox.
 */
export function composeFormDelivery(
  required: FormDeliveryCompositionDeps,
  optional: { warn?: (message: string) => void } = {},
): { start(required?: Record<string, never>, optional?: Record<string, never>): Promise<void> } {
  const warn = optional.warn ?? ((message: string) => console.warn(message));
  const planner = {
    plans: required.plans,
    bindings: ({ workspaceId }: { workspaceId: string }) => readFormDeliveryBindings({ settingsRepo: required.settingsRepo, workspaceId }),
    snapshot: async (input: { workspaceId: string; submissionId: string; formId: string }) =>
      readDeliverySnapshot({ deps: required, ...input }),
    newId: () => required.idGen.newId(),
    nowIso: () => required.clock.nowIso(),
  };
  return createFormDeliverySubscriptions({
    bus: required.bus,
    plan: (input) => planFormDeliveries({ deps: planner, ...input }, { onSourceGone: "empty-plan", report: ({ message }) => warn(`[form-delivery] ${message}`) }),
    deliver: required.deliver,
    readSubmission: async ({ workspaceId, submissionId, formId }) => {
      const submission = await required.formSubmissionRepo.findById({ workspaceId, id: submissionId });
      if (!submission || submission.formDefinitionId !== formId) return null;
      return { id: submission.id, answers: submission.data, submittedAt: submission.submittedAt };
    },
  });
}

/** The form's fields (with labels and types) and the stored answers; never the source IP or the
 *  notification settings. Null when either row is gone or the submission belongs to another form. */
async function readDeliverySnapshot(
  required: { deps: FormDeliveryCompositionDeps; workspaceId: string; submissionId: string; formId: string },
): Promise<FormDeliverySnapshot | null> {
  const { deps, workspaceId, submissionId, formId } = required;
  const [definition, submission] = await Promise.all([
    deps.formDefinitionRepo.findById({ workspaceId, id: formId }),
    deps.formSubmissionRepo.findById({ workspaceId, id: submissionId }),
  ]);
  if (!definition || !submission || submission.formDefinitionId !== definition.id) return null;
  return { form: buildFormDeliveryForm({ definition: submissionEvidenceDefinition({ definition, evidence: submission.evidence }) }), submission: { id: submission.id, answers: submission.data, submittedAt: submission.submittedAt } };
}
