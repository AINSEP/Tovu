import type { EventBusPort } from "@jini-ai/cms/core";
import { createFormDeliverySubscriptions, planFormDeliveries, type FormDefinitionRepoPort, type FormDeliveryJob, type FormDeliveryPlan,
  type FormDeliveryPlanPort, type FormDeliveryResult, type FormDeliverySnapshot, type FormSubmissionRepoPort } from "@jini-ai/cms/forms";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { buildFormDeliveryForm } from "#src/features/forms/index";
import { readFormDeliveryBindings } from "#src/features/settings/index";

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

/** Thrown by the snapshot read when the submission or its form is gone; the plan store below turns
 * it into an empty plan. */
class DeliverySourceGoneError extends Error {
  constructor(readonly required: { workspaceId: string; submissionId: string; formId: string }) {
    super(`form delivery source gone: submission ${required.submissionId}`);
  }
}

/**
 * Builds the subscriptions; `start()` is idempotent and installs the planner on
 * `form.submission.received` and the deliverer on `form.submission.delivery`.
 * A submission (or form) deleted before its event is planned records an EMPTY plan and logs one
 * line, instead of Jini's planner throwing: a throw fails the whole event, so the bus would re-run
 * its other subscribers (the notification email, the webhook) on every retry, for nothing.
 * @param optional.warn where that line goes (default `console.warn`).
 * @complexity O(1) to build; planning is O(bindings × formIds) per submission.
 */
export function composeFormDelivery(
  required: FormDeliveryCompositionDeps,
  optional: { warn?: (message: string) => void } = {},
): { start(required?: Record<string, never>, optional?: Record<string, never>): Promise<void> } {
  const warn = optional.warn ?? ((message: string) => console.warn(message));
  const planner = {
    plans: { once: (input: Parameters<FormDeliveryPlanPort["once"]>[0]) => required.plans.once({ ...input, build: () => emptyPlanWhenGone({ build: input.build, warn }) }) },
    bindings: ({ workspaceId }: { workspaceId: string }) => readFormDeliveryBindings({ settingsRepo: required.settingsRepo, workspaceId }),
    snapshot: async (input: { workspaceId: string; submissionId: string; formId: string }) =>
      (await readDeliverySnapshot({ deps: required, ...input })) ?? Promise.reject(new DeliverySourceGoneError(input)),
    newId: () => required.idGen.newId(),
    nowIso: () => required.clock.nowIso(),
  };
  return createFormDeliverySubscriptions({
    bus: required.bus,
    plan: (input) => planFormDeliveries({ deps: planner, ...input }),
    deliver: required.deliver,
  });
}

/** Runs the planner's `build`; when its source is gone, the empty plan instead (one log line naming
 * only the submission id). Every other failure still throws, so the event retries.
 * @throws whatever `build` throws, except {@link DeliverySourceGoneError}. @complexity O(1) beyond `build`. */
async function emptyPlanWhenGone(
  required: { build: () => Promise<FormDeliveryPlan>; warn: (message: string) => void },
): Promise<FormDeliveryPlan> {
  try {
    return await required.build();
  } catch (error) {
    if (!(error instanceof DeliverySourceGoneError)) throw error;
    const { workspaceId, submissionId, formId } = error.required;
    required.warn(`[form-delivery] submission ${submissionId} or its form no longer exists; recorded an empty delivery plan`);
    return { workspaceId, submissionId, formId, jobs: [] };
  }
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
