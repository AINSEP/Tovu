/** Durable forms fan-out. Persistence, adapter I/O and settings enter through host ports. */
import type { DomainEvent } from '../core/index.js';

export const FORM_DELIVERY_EVENT = 'form.submission.delivery';
export interface FormDeliveryBinding {
  readonly bindingId: string;
  readonly adapterId: string;
  readonly connectionRef: string;
  readonly enabled: boolean;
  readonly formIds?: readonly string[];
  /** Adapter-owned non-secret configuration; credentials remain references. */
  readonly config: Readonly<Record<string, unknown>>;
}
export interface FormDeliverySnapshot {
  readonly form: { readonly slug: string; readonly fields: readonly { readonly name: string; readonly required: boolean; readonly maxLength?: number; readonly multiple?: true }[] };
  readonly submission: { readonly id: string; readonly answers: Readonly<Record<string, unknown>>; readonly submittedAt: string };
}
export type FormDeliveryJob = {
  readonly binding: FormDeliveryBinding;
  readonly snapshot: FormDeliverySnapshot;
  readonly idempotencyKey: string;
};
export interface FormDeliveryPlan {
  readonly workspaceId: string;
  readonly submissionId: string;
  readonly jobs: readonly DomainEvent<FormDeliveryJob>[];
}
export interface FormDeliveryStatus {
  readonly bindingId: string;
  readonly jobId: string;
  readonly status: 'pending' | 'retrying' | 'completed' | 'failed';
  readonly attempts: number;
  readonly nextRetryAt: string | null;
  readonly error: string | null;
}
export interface FormDeliveryStatusPort {
  read(required: { workspaceId: string; submissionId: string }, optional?: Record<string, never>): Promise<readonly FormDeliveryStatus[]>;
}
export interface FormDeliveryPlanPort {
  /** Serializes concurrent source events; plan and ALL jobs must commit or roll back together. */
  once(required: { workspaceId: string; submissionId: string; build: () => Promise<FormDeliveryPlan> }, optional?: Record<string, never>): Promise<FormDeliveryPlan>;
}
export interface FormDeliveryPlannerDeps {
  plans: FormDeliveryPlanPort;
  bindings(required: { workspaceId: string }): Promise<readonly FormDeliveryBinding[]>;
  snapshot(required: { workspaceId: string; submissionId: string; formDefinitionId: string }): Promise<FormDeliverySnapshot | null>;
  newId(): string;
  nowIso(): string;
}

/** Freeze selection and payload once, even for an empty binding list. Replays never read settings.
 * Throws on persistence/missing-source faults so the source outbox job can retry.
 * @example await planFormDeliveries({ deps, workspaceId, submissionId, formDefinitionId });
 * @complexity O(bindings * form filters); persistence performs one job insert per selected binding.
 */
export function planFormDeliveries(
  required: { deps: FormDeliveryPlannerDeps; workspaceId: string; submissionId: string; formDefinitionId: string },
  _options: Record<string, never> = {},
): Promise<FormDeliveryPlan> {
  const { deps, workspaceId, submissionId, formDefinitionId } = required;
  return deps.plans.once({ workspaceId, submissionId, build: async () => {
    const bindings = await deps.bindings({ workspaceId });
    const selected = bindings.filter(b => b.enabled && (b.formIds === undefined || b.formIds.includes(formDefinitionId)));
    const snapshot = selected.length ? await deps.snapshot({ workspaceId, submissionId, formDefinitionId }) : null;
    if (selected.length && !snapshot) throw new Error('Form delivery source is unavailable');
    const occurredAt = deps.nowIso();
    const jobs = selected.map(binding => ({ id: deps.newId(), name: FORM_DELIVERY_EVENT, workspaceId, aggregateId: submissionId, occurredAt,
      payload: { binding, snapshot: snapshot!, idempotencyKey: JSON.stringify([submissionId, binding.bindingId]) } }));
    return { workspaceId, submissionId, jobs };
  } });
}

export type FormDeliveryResult = { readonly ok: true; readonly reference?: string } | {
  readonly ok: false;
  readonly error: { readonly code: string; readonly retryable: boolean; readonly retryAfterMs?: number };
};
/** Only allowlisted error codes leave the adapter boundary. Provider messages can contain secrets. */
export class FormDeliveryError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  constructor(required: { code: string; retryable: boolean; retryAfterMs?: number }, _options: Record<string, never> = {}) {
    super(safeFormDeliveryError({ code: required.code }));
    this.name = 'FormDeliveryError';
    this.retryable = required.retryable;
    this.retryAfterMs = required.retryAfterMs;
  }
}
/** Status never exposes adapter messages, URLs, answers, or credential values. */
export function safeFormDeliveryError(required: { code?: string }, _options: Record<string, never> = {}): string {
  const allowed = ['authorization-required', 'rate-limited', 'configuration-invalid', 'adapter-unavailable', 'delivery-failed'];
  return allowed.includes(required.code ?? '') ? required.code! : 'delivery-failed';
}

/** Execute only the frozen child payload; normalize failures before they reach the worker ledger.
 * Legacy void-returning delivery adapters remain supported. No retry loop lives here.
 * @example await deliverFormJob({ job, deliver });
 */
export async function deliverFormJob(
  required: { job: FormDeliveryJob; deliver: (input: FormDeliveryJob) => Promise<FormDeliveryResult | void> },
  _options: Record<string, never> = {},
): Promise<void> {
  try {
    const result = await required.deliver(required.job);
    if (result && !result.ok) throw new FormDeliveryError(result.error);
  } catch (error) {
    if (error instanceof FormDeliveryError) throw error;
    throw new FormDeliveryError({ code: 'delivery-failed', retryable: true });
  }
}

/** Create one subscriber installation per host composition; exporter apps may call start repeatedly.
 * Subscribe registers synchronously in the CMS bus; awaiting its receipt is only needed to stop.
 * @example const subscriptions = createFormDeliverySubscriptions({ bus, plan, deliver }); subscriptions.start({});
 */
export function createFormDeliverySubscriptions(required: {
  bus: import('../core/index.js').EventBusPort;
  plan: (input: { workspaceId: string; submissionId: string; formDefinitionId: string }) => Promise<unknown>;
  deliver: (input: { workspaceId: string; job: FormDeliveryJob }) => Promise<void>;
}, _options: Record<string, never> = {}) {
  let started = false;
  return { start(_input: Record<string, never> = {}, _optional: Record<string, never> = {}): void {
    if (started) return;
    started = true;
    void required.bus.subscribe<{ submissionId: string; formDefinitionId: string }>({ eventName: 'form.submission.received', handler: async event => {
      await required.plan({ workspaceId: event.workspaceId, submissionId: event.payload.submissionId, formDefinitionId: event.payload.formDefinitionId });
    } });
    void required.bus.subscribe<FormDeliveryJob>({ eventName: FORM_DELIVERY_EVENT, handler: async event => {
      await required.deliver({ workspaceId: event.workspaceId, job: event.payload });
    } });
  } };
}
