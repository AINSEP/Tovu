import type { EventBusPort } from "@jini-ai/cms/core";
import { createFormDeliverySubscriptions, planFormDeliveries, type FormDefinitionRepoPort, type FormDeliveryJob, type FormDeliveryPlanPort,
  type FormDeliveryResult, type FormDeliverySnapshot, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { buildFormDeliveryForm } from "#src/features/forms/index";
import { readFormDeliveryBindings } from "#src/features/settings/form-delivery";

/**
 * @file Binds Jini's durable form delivery (`@jini-ai/cms/forms`: plan once per submission, one
 * outbox child job per selected binding) to this site: bindings come from the
 * `core.forms/deliveryBindings` setting, the frozen snapshot from the forms repos, and each
 * attempt goes to `deliver` (the form-destinations deliverer). Nothing subscribes until `start`,
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
 * @complexity O(1) to build; planning is O(bindings × formIds) per submission.
 */
export function composeFormDelivery(
  required: FormDeliveryCompositionDeps,
  _optional: Record<string, never> = {},
): { start(required?: Record<string, never>, optional?: Record<string, never>): Promise<void> } {
  const planner = {
    plans: required.plans,
    bindings: ({ workspaceId }: { workspaceId: string }) => readFormDeliveryBindings({ settingsRepo: required.settingsRepo, workspaceId }),
    snapshot: (input: { workspaceId: string; submissionId: string; formId: string }) => readDeliverySnapshot({ deps: required, ...input }),
    newId: () => required.idGen.newId(),
    nowIso: () => required.clock.nowIso(),
  };
  return createFormDeliverySubscriptions({
    bus: required.bus,
    plan: (input) => planFormDeliveries({ deps: planner, ...input }),
    deliver: required.deliver,
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
  return { form: buildFormDeliveryForm({ definition }), submission: { id: submission.id, answers: submission.data, submittedAt: submission.submittedAt } };
}
