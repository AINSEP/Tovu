import { randomUUID } from "node:crypto";

import type { BackupRepositoryState } from "./github-push.js";
import type { PlannedDiskFile, SiteBackupInclude, SiteBackupScope, SkippedSiteBackupFile } from "./sources.js";

/**
 * @file Holds a planned site backup between `site_backup_plan` and `site_backup_push`, in memory.
 *
 * A plan carries the database snapshot's bytes, so the push uploads exactly the database the human
 * reviewed and no snapshot file ever sits on disk waiting to be orphaned. That is also why this
 * store is small and short-lived: at most {@link DEFAULT_MAX_PLANS} plans, each for
 * {@link DEFAULT_PLAN_TTL_MS}, the oldest evicted first, and expired plans swept on every save.
 *
 * A plan is single-use and bound to the principal and workspace that made it: {@link
 * SiteBackupPlanStore.take} deletes it, and another principal's id reads as not found — never as
 * "exists but not yours", which would confirm a guessed id.
 *
 * In memory only: a server restart drops every plan, and the push then says to plan again.
 */

/** Everything `site_backup_push` needs from the plan, so it never re-derives what the human saw. */
export interface SiteBackupPlanContent {
  readonly credentialLabel: string;
  readonly owner: string;
  readonly repo: string;
  readonly folder: string;
  readonly commitMessage: string;
  /** Branch, tip and tree at plan time. The push commits on THIS parent, so a branch that moved in
   *  between is refused by GitHub's non-force ref update. */
  readonly repository: BackupRepositoryState;
  readonly include: SiteBackupInclude;
  /** `null` when the database scope is off. */
  readonly database: { readonly bytes: Buffer; readonly watermarkAtCapture: number } | null;
  readonly files: readonly PlannedDiskFile[];
  readonly skipped: readonly SkippedSiteBackupFile[];
  readonly scopeNotes: Partial<Record<SiteBackupScope, string>>;
  /** Database snapshot plus every disk file, in bytes (the manifest is not counted). */
  readonly totalBytes: number;
  readonly site: { readonly name: string; readonly folderName: string };
  readonly schema: { readonly index: number; readonly tag: string };
  readonly tovuVersion: string;
  /** When the plan (and its database snapshot) was made — the manifest's `createdAt`. */
  readonly createdAt: string;
}

export interface SiteBackupPlan extends SiteBackupPlanContent {
  readonly planId: string;
  readonly principalId: string;
  readonly workspaceId: string;
  readonly expiresAtMs: number;
}

export type TakeSiteBackupPlanResult = { ok: true; plan: SiteBackupPlan } | { ok: false; code: "PLAN_NOT_FOUND" | "PLAN_EXPIRED" };

export const DEFAULT_PLAN_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_PLANS = 2;

export class SiteBackupPlanStore {
  private readonly plans = new Map<string, SiteBackupPlan>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxPlans: number;
  private readonly newId: () => string;

  constructor(optional: { now?: () => number; ttlMs?: number; maxPlans?: number; newId?: () => string } = {}) {
    this.now = optional.now ?? Date.now;
    this.ttlMs = optional.ttlMs ?? DEFAULT_PLAN_TTL_MS;
    this.maxPlans = optional.maxPlans ?? DEFAULT_MAX_PLANS;
    this.newId = optional.newId ?? randomUUID;
  }

  /**
   * Stores a plan and returns it with its id and expiry. Expired plans are swept first, then the
   * oldest are evicted until there is room.
   *
   * @complexity O(plans held), which is at most `maxPlans`.
   */
  save(input: { principalId: string; workspaceId: string; content: SiteBackupPlanContent }): SiteBackupPlan {
    const nowMs = this.now();
    for (const [id, plan] of this.plans) {
      if (plan.expiresAtMs <= nowMs) this.plans.delete(id);
    }
    while (this.plans.size >= this.maxPlans) {
      const oldest = this.plans.keys().next().value;
      if (oldest === undefined) break;
      this.plans.delete(oldest);
    }
    const plan: SiteBackupPlan = { ...input.content, planId: this.newId(), principalId: input.principalId, workspaceId: input.workspaceId, expiresAtMs: nowMs + this.ttlMs };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  /**
   * Removes and returns the plan, once. A plan made by another principal or workspace reads as
   * `PLAN_NOT_FOUND` and is left in place; an expired one is removed and reads as `PLAN_EXPIRED`.
   *
   * @complexity O(1).
   */
  take(input: { planId: string; principalId: string; workspaceId: string }): TakeSiteBackupPlanResult {
    const plan = this.plans.get(input.planId);
    if (!plan || plan.principalId !== input.principalId || plan.workspaceId !== input.workspaceId) return { ok: false, code: "PLAN_NOT_FOUND" };
    this.plans.delete(input.planId);
    if (plan.expiresAtMs <= this.now()) return { ok: false, code: "PLAN_EXPIRED" };
    return { ok: true, plan };
  }
}

/** The process-wide store the tools use unless a test injects its own. */
export const siteBackupPlanStore = new SiteBackupPlanStore();
