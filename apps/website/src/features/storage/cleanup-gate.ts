import { createHash } from "node:crypto";
import type { CleanupPreviewStore } from "@jini-ai/core/contracts/storage";

/**
 * @file The one gate every live storage cleanup passes through (Codex FIX 5). The HTTP cleanup route
 * and the `site_storage_cleanup` assistant tool both run their live pass only via {@link
 * StorageCleanupGate.apply}, and only with a grant minted by {@link StorageCleanupGate.preview} — the
 * preview the owner's existing card shows (the Storage screen's "Review and confirm", or the chat's
 * approval card). The grant is:
 * - PINNED: its scope is a hash of the previewed plan, and apply re-measures and must hash the same;
 * - SINGLE-USE: the preview store's `take` removes it synchronously before the live pass starts, so a
 *   replay (or a second concurrent apply) finds nothing;
 * - bound to the principal it was minted for, and EXPIRING with the store's deadline.
 * A dry run stays free and mints nothing.
 */

/** A pass as the routes show it: per-policy numbers, never paths. */
export interface StoragePassView { readonly status: string; readonly dryRun: boolean; readonly policies?: readonly { readonly id: string; readonly bytes?: number | null; readonly items?: number }[] }

/** Why a live cleanup did not run: no grant at all, or one that is unknown, used, expired, someone else's or for another plan. */
export type StorageCleanupRefusal = "no-grant" | "grant-invalid";
export type StorageCleanupApplyOutcome = { readonly status: "applied"; readonly pass: StoragePassView } | { readonly status: "refused"; readonly reason: StorageCleanupRefusal };

export interface StorageCleanupGate {
  /** Measure only; mints nothing. */
  dryRun(required: Record<string, never>, optional: Record<string, never>): Promise<StoragePassView>;
  /** Measure and mint the single-use grant pinned to exactly this plan, for this principal. */
  preview(required: { principalId: string }, optional: Record<string, never>): Promise<{ pass: StoragePassView; previewToken: string }>;
  /** Run live once, only if `previewToken` is this principal's unexpired grant for the plan as it stands now. */
  apply(required: { principalId: string; previewToken: string | undefined }, optional: Record<string, never>): Promise<StorageCleanupApplyOutcome>;
}

/** Required collaborators of {@link createStorageCleanupGate}. */
export interface StorageCleanupGateRequired {
  runOnce: (required: { dryRun: boolean }, optional: Record<string, never>) => Promise<StoragePassView>;
  previewStore: CleanupPreviewStore;
}

export const STORAGE_CLEANUP_GRANT_KIND = "site-storage-cleanup";

/** The plan a grant is pinned to: the pass status and every policy's numbers, without timestamps. @complexity O(policies). */
export function storageCleanupPlanHash({ pass }: { pass: StoragePassView }, _optional: Record<string, never> = {}): string {
  const plan = { status: pass.status, policies: pass.policies ?? [] };
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

/**
 * Builds the gate over the retention runner and the preview store. The store must be the one
 * instance shared by every entry point of this serving process, so a grant is spent everywhere at once.
 * @complexity O(1) to build; preview one dry pass, apply one dry pass plus at most one live pass.
 */
export function createStorageCleanupGate({ runOnce, previewStore }: StorageCleanupGateRequired, _optional: Record<string, never> = {}): StorageCleanupGate {
  const kind = STORAGE_CLEANUP_GRANT_KIND;
  return {
    dryRun: () => runOnce({ dryRun: true }, {}),
    preview: async ({ principalId }) => {
      const pass = await runOnce({ dryRun: true }, {});
      const { token } = previewStore.put({ principal: principalId, kind, scope: storageCleanupPlanHash({ pass }), payload: {} }, {});
      return { pass, previewToken: token };
    },
    apply: async ({ principalId, previewToken }) => {
      if (!previewToken) return { status: "refused", reason: "no-grant" };
      const current = await runOnce({ dryRun: true }, {});
      // `take` is synchronous: nothing can interleave between finding the grant and spending it.
      const grant = previewStore.take({ token: previewToken, principal: principalId, kind, scope: storageCleanupPlanHash({ pass: current }) }, {});
      if (grant === null) return { status: "refused", reason: "grant-invalid" };
      return { status: "applied", pass: await runOnce({ dryRun: false }, {}) };
    },
  };
}
