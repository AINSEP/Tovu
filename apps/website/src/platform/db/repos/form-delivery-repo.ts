import type { DomainEvent, OutboxRecord } from "@jini-ai/cms/core";
import {
  type FormDeliveryJob, type FormDeliveryPlan, type FormDeliveryPlanPort,
  type FormPullClaim, type FormPullLeasePort, type FormPullRefusal, formDeliveryStatusFromOutbox,
} from "@jini-ai/cms/forms";
import { DELIVERY_STATUS_MAX_LIMIT, type FormDeliveryStatusRow } from "#src/contracts/headless/index";

import type { Kysely } from "kysely";

import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { outboxEventValues } from "./outbox-repo.js";

const JOB_WORKSPACE_ID = "j.workspace_id";
const JOB_SUBMISSION_ID = "j.submission_id";


/**
 * @file SQL adapters (one Kysely body for SQLite and Postgres) for durable form delivery
 * (migration 0019): the plan-once store behind `@jini-ai/cms/forms`' `FormDeliveryPlanPort`, the
 * per-binding status reads, and the receiver pull lease behind `FormPullLeasePort`.
 *
 * Status is never stored here. It is projected from each child job's `outbox_events` row by the
 * Jini `formDeliveryStatusFromOutbox`, so the outbox worker stays the only state machine. The
 * frozen job payload (answers included) lives only in `outbox_events`; `form_delivery_jobs` holds
 * just the ids a status read prints, so status reads never load answers.
 */

export type { FormDeliveryStatusRow };

/** Outbox statuses that are not `delivered`; matches `idx_outbox_events_claim`'s leading column. */
const UNFINISHED_STATUSES = ["pending", "processing", "failed"];

/** The safe code a purged submission's unfinished jobs fail with (the contract has no closer one). */
const PURGED_JOB_ERROR = "delivery-failed";

interface StatusSqlRow {
  binding_id: string; adapter_id: string; form_id: string; submission_id: string;
  status: string; attempts: number; next_attempt_at: string; last_error: string | null;
}

/** The status columns of `workspaceId`'s jobs: the job index row, its outbox row and its plan. */
function statusQuery(db: Kysely<ContentDatabase>, workspaceId: string) {
  return db.selectFrom("form_delivery_jobs as j")
    .innerJoin("outbox_events as o", "o.id", "j.job_id")
    .innerJoin("form_delivery_plans as p", join => join.onRef("p.workspace_id", "=", JOB_WORKSPACE_ID).onRef("p.submission_id", "=", JOB_SUBMISSION_ID))
    .select(["j.binding_id", "j.adapter_id", "p.form_id", JOB_SUBMISSION_ID, "o.status", "o.attempts", "o.next_attempt_at", "o.last_error"])
    .where(JOB_WORKSPACE_ID, "=", workspaceId);
}

/** The job's outbox columns once its submission is purged: answers blanked, and an unfinished job
 * failed so the worker never claims it again. `failed` is terminal for the outbox worker. */
function purgedJobColumns(row: { event_json: string; status: string }) {
  const event = JSON.parse(row.event_json) as DomainEvent<FormDeliveryJob>;
  const { snapshot } = event.payload;
  const payload = { ...event.payload, snapshot: { ...snapshot, submission: { ...snapshot.submission, answers: {} } } };
  const scrubbed = { event_json: JSON.stringify({ ...event, payload }) };
  return row.status === "pending" || row.status === "processing" ? { ...scrubbed, status: "failed", last_error: PURGED_JOB_ERROR } : scrubbed;
}

function toStatusRow(row: StatusSqlRow): FormDeliveryStatusRow {
  const status = formDeliveryStatusFromOutbox({ row: {
    status: row.status as OutboxRecord["status"], attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error,
  } });
  return { bindingId: row.binding_id, adapterId: row.adapter_id, formId: row.form_id, submissionId: row.submission_id, ...status };
}

/** Refuses a plan or child job built for another workspace or submission: the plan row and its
 * jobs are keyed by the REQUESTED identity, so a mismatch would file one workspace's deliveries
 * (and answers) under another. */
function assertSameIdentity(required: { requested: { workspaceId: string; submissionId: string }; what: string; workspaceId: string; submissionId: string | undefined }): void {
  const { requested } = required;
  if (required.workspaceId === requested.workspaceId && required.submissionId === requested.submissionId) return;
  throw new Error(`Form delivery plan refused: ${required.what} is for workspace ${required.workspaceId}, submission ${required.submissionId}, ` +
    `not workspace ${requested.workspaceId}, submission ${requested.submissionId}. The planner must build for the requested submission; nothing was stored.`);
}

/** Plans (plan-once with child jobs) and per-binding status reads. */
export class SqlFormDeliveryRepo implements FormDeliveryPlanPort {
  private readonly required: { kernel: ContentKernel };
  constructor(required: { kernel: ContentKernel }, _optional: Record<string, never> = {}) {
    this.required = required;
  }

  /**
   * Returns the stored plan, or runs `build` and stores the plan row, every child outbox job and
   * its index row in ONE transaction. `lockKey` serializes concurrent callers for the same
   * submission on Postgres (on SQLite the write transaction already does), so a replayed source
   * event never plans twice. A replay returns the jobs from the outbox in job-id order (each job
   * delivers independently, so order carries no meaning).
   * @throws Error when the built plan or a child job names another workspace/submission (rolled back).
   * @complexity O(jobs) inserts on first call; one indexed read on replay.
   */
  async once(
    required: { workspaceId: string; submissionId: string; build: () => Promise<FormDeliveryPlan> },
    _optional: Record<string, never> = {},
  ): Promise<FormDeliveryPlan> {
    const { kernel } = this.required;
    const { workspaceId, submissionId } = required;
    return kernel.transaction(async () => {
      await kernel.lockKey(JSON.stringify(["form-delivery-plan", workspaceId, submissionId]));
      const stored = await this.storedPlan({ workspaceId, submissionId });
      if (stored) return stored;
      const plan = await required.build();
      await this.store({ requested: { workspaceId, submissionId }, plan });
      return plan;
    });
  }

  private async storedPlan(required: { workspaceId: string; submissionId: string }): Promise<FormDeliveryPlan | null> {
    const { workspaceId, submissionId } = required;
    const row = await this.required.kernel.run(db => db.selectFrom("form_delivery_plans").select("form_id")
      .where("workspace_id", "=", workspaceId).where("submission_id", "=", submissionId).executeTakeFirst());
    if (!row) return null;
    const jobs = await this.required.kernel.run(db => db.selectFrom("form_delivery_jobs as j")
      .innerJoin("outbox_events as o", "o.id", "j.job_id").select("o.event_json")
      .where(JOB_WORKSPACE_ID, "=", workspaceId).where(JOB_SUBMISSION_ID, "=", submissionId).orderBy("j.job_id").execute());
    return { workspaceId, submissionId, formId: row.form_id, jobs: jobs.map(job => JSON.parse(job.event_json) as DomainEvent<FormDeliveryJob>) };
  }

  private async store(required: { requested: { workspaceId: string; submissionId: string }; plan: FormDeliveryPlan }): Promise<void> {
    const { requested, plan } = required;
    assertSameIdentity({ requested, what: "the built plan", workspaceId: plan.workspaceId, submissionId: plan.submissionId });
    for (const job of plan.jobs) assertSameIdentity({ requested, what: `child job ${job.id}`, workspaceId: job.workspaceId, submissionId: job.aggregateId });
    const { kernel } = this.required;
    await kernel.run(db => db.insertInto("form_delivery_plans")
      .values({ workspace_id: plan.workspaceId, submission_id: plan.submissionId, form_id: plan.formId }).execute());
    for (const job of plan.jobs) {
      await kernel.run(db => db.insertInto("outbox_events").values(outboxEventValues(job)).execute());
      await kernel.run(db => db.insertInto("form_delivery_jobs").values({ job_id: job.id, workspace_id: plan.workspaceId,
        submission_id: plan.submissionId, binding_id: job.payload.binding.bindingId, adapter_id: job.payload.binding.adapterId }).execute());
    }
  }

  /**
   * After a permanent delete (a Trash purge of the submission, or of its form with every submission
   * it had): blanks the answers frozen into those submissions' delivery jobs and fails the jobs not
   * yet finished, so the deleted answers neither stay in Tovu nor reach a destination later.
   * Copies a destination already received are outside Tovu and stay. Runs inside the purge's own
   * transaction (the kernel joins it), so the purge and the scrub commit or roll back together.
   * @complexity O(jobs of the purged submissions): one indexed read, one update per job.
   */
  async scrubPurged(
    required: { workspaceId: string; purged: { submissionId: string } | { formId: string } },
    _optional: Record<string, never> = {},
  ): Promise<void> {
    const { kernel } = this.required;
    const { workspaceId, purged } = required;
    const [column, id] = "submissionId" in purged ? ["p.submission_id", purged.submissionId] as const : ["p.form_id", purged.formId] as const;
    const jobs = await kernel.run(db => db.selectFrom("form_delivery_jobs as j")
      .innerJoin("form_delivery_plans as p", join => join.onRef("p.workspace_id", "=", JOB_WORKSPACE_ID).onRef("p.submission_id", "=", JOB_SUBMISSION_ID))
      .innerJoin("outbox_events as o", "o.id", "j.job_id")
      .select(["o.id", "o.event_json", "o.status"])
      .where(JOB_WORKSPACE_ID, "=", workspaceId).where(column, "=", id).execute());
    for (const job of jobs) {
      await kernel.run(db => db.updateTable("outbox_events").set(purgedJobColumns(job)).where("id", "=", job.id).execute());
    }
  }

  /**
   * Every binding's status for one submission of `workspaceId`, ordered by binding id.
   * @complexity O(bindings of the submission), via `ux_form_delivery_jobs_binding` and primary keys.
   */
  async forSubmission(required: { workspaceId: string; submissionId: string }, _optional: Record<string, never> = {}): Promise<FormDeliveryStatusRow[]> {
    const { kernel } = this.required;
    const rows = await kernel.run(db => statusQuery(db, required.workspaceId).where(JOB_SUBMISSION_ID, "=", required.submissionId)
      .orderBy("j.binding_id").execute());
    return rows.map(toStatusRow);
  }

  /**
   * The most recent jobs of `workspaceId` that are not completed (pending, retrying or failed),
   * newest first, `limit` of them (default {@link DELIVERY_STATUS_MAX_LIMIT}).
   * @param optional.limit not validated here: the only caller, `forms_delivery_status`, already
   *   refuses anything but an integer from 1 to {@link DELIVERY_STATUS_MAX_LIMIT}.
   * @complexity Driven from `idx_outbox_events_claim` (undelivered rows only), joined by primary key.
   */
  async recentUnfinished(required: { workspaceId: string }, optional: { limit?: number } = {}): Promise<FormDeliveryStatusRow[]> {
    const { kernel } = this.required;
    const rows = await kernel.run(db => statusQuery(db, required.workspaceId).where("o.status", "in", UNFINISHED_STATUSES)
      .orderBy("o.created_at", "desc").orderBy("o.id", "desc").limit(optional.limit ?? DELIVERY_STATUS_MAX_LIMIT).execute());
    return rows.map(toStatusRow);
  }
}

interface PullRow { lease_token: string | null; lease_expires_at: string | null; last_started_at: string }

/** Why a claim at `nowMs` must wait, or null when it may start. An expired lease is free again,
 * which is how a pull that crashed mid-way recovers. `recentMs` 0 (manual) never refuses `recent`,
 * even when the clock moved back past the last start. */
function refusalOf(row: PullRow | undefined, nowMs: number, recentMs: number): FormPullRefusal | null {
  if (!row) return null;
  // Claim and release always set or clear token and expiry together, so the expiry alone says "held".
  if (row.lease_expires_at !== null && Date.parse(row.lease_expires_at) > nowMs) return "already-running";
  if (recentMs > 0 && nowMs - Date.parse(row.last_started_at) < recentMs) return "recent";
  return null;
}

/** The lease end. A non-positive or non-finite `leaseMs` would grant a lease that is already
 * over, letting two pulls overlap, so it is refused instead of stored. */
function leaseExpiresAt(nowIso: string, leaseMs: number): string {
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs) || !Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new RangeError(`Form pull lease refused: nowIso must be an ISO time and leaseMs a positive finite number (got ${leaseMs}); pass the pull's bounded duration.`);
  }
  return new Date(nowMs + leaseMs).toISOString();
}

/**
 * The per-receiver pull lease. `leaseMs` comes from the caller, which owns the pull's page and time
 * bounds and must prove the lease outlasts the bounded pull (see `withFormPullLease`).
 */
export class SqlFormPullLeaseRepo implements FormPullLeasePort {
  private readonly required: { kernel: ContentKernel };
  constructor(required: { kernel: ContentKernel }, _optional: Record<string, never> = {}) {
    this.required = required;
  }

  /**
   * Atomic admission: under `lockKey` (Postgres advisory lock; SQLite's write transaction), reads
   * the receiver row, refuses with the reason, or records this start and lease in one upsert.
   * @throws RangeError when `nowIso` or `leaseMs` is unusable (before touching the database).
   * @complexity O(1): one primary-key read and one upsert.
   */
  async claim(
    required: { workspaceId: string; receiverKey: string; token: string; nowIso: string; recentMs: number; leaseMs: number },
    _optional: Record<string, never> = {},
  ): Promise<FormPullClaim> {
    const { kernel } = this.required;
    const { workspaceId, receiverKey, token, nowIso } = required;
    const expiresAt = leaseExpiresAt(nowIso, required.leaseMs);
    return kernel.transaction(async () => {
      await kernel.lockKey(JSON.stringify(["form-receiver-pull", workspaceId, receiverKey]));
      const row = await kernel.run(db => db.selectFrom("form_receiver_pulls").select(["lease_token", "lease_expires_at", "last_started_at"])
        .where("workspace_id", "=", workspaceId).where("receiver_key", "=", receiverKey).executeTakeFirst());
      const reason = refusalOf(row, Date.parse(nowIso), required.recentMs);
      if (reason) return { claimed: false, reason };
      const lease = { lease_token: token, lease_expires_at: expiresAt, last_started_at: nowIso };
      await kernel.run(db => db.insertInto("form_receiver_pulls").values({ workspace_id: workspaceId, receiver_key: receiverKey, ...lease })
        .onConflict(conflict => conflict.columns(["workspace_id", "receiver_key"]).doUpdateSet(lease)).execute());
      return { claimed: true };
    });
  }

  /** Clears the lease only while `token` still holds it, so a pull that outlived its lease cannot
   * free a newer holder; the last start stays for the `recent` check. @complexity O(1). */
  async release(required: { workspaceId: string; receiverKey: string; token: string }, _optional: Record<string, never> = {}): Promise<void> {
    await this.required.kernel.run(db => db.updateTable("form_receiver_pulls").set({ lease_token: null, lease_expires_at: null })
      .where("workspace_id", "=", required.workspaceId).where("receiver_key", "=", required.receiverKey)
      .where("lease_token", "=", required.token).execute());
  }
}
