/**
 * @file Newsletter's `DataModuleDecl` for the 5 relational `p_newsletter__*` tables (ADR-PIPE-011
 * Decision §2/§3; state.spec.md §2).
 *
 * `declareDataModule()` (`src/features/plugins/data-module.ts`) now implements ADR-023's full
 * accepted T1-T8 safety mechanics (SPEC-032, 2026-07-16) — exclusive-lock-guarded DDL, a durable
 * crash-recovery phase journal with mandatory boot-time restore, disk-headroom preflight, tier
 * gating, and the namespace-adoption guard — closing the gap this comment used to warn about
 * (this file was, until SPEC-032, this engine's only real production consumer running against
 * pre-acceptance spike code). `__tests__/data-module-manifest.failure-rollback.test.ts` (T010) is
 * the REQUIRED, dedicated integration test proving the snapshot-before-DDL mechanism behaves
 * correctly against THIS real manifest; it gates every task that writes to a `p_newsletter__*`
 * table (lists.ts, confirmation.ts, unsubscribe.ts, subscriptions.ts,
 * send-pipeline.ts's `freezeAudience`/`recordResult`).
 *
 * Scope: first-party bundled invocation only (ADR-034 Round-3 fold, sweep §A.2 sanction) — NOT a
 * general third-party plugin registration surface (ADR-023 §12 still rejects that in v1). Mirrors
 * `src/features/plugins/store/store-plugin.ts`'s `STORE_MANIFEST`/`activateStore` shape, which is
 * this repo's only other real caller of `declareDataModule()`.
 */
import type Database from "better-sqlite3";

import { declareDataModule, type DataModuleDecl } from "../features/plugins/data-module.js";

export const NEWSLETTER_PLUGIN_ID = "newsletter";

/** Fully-qualified table name helper — matches `declareDataModule()`'s own `p_{pluginId}__{name}` convention. */
export const p = (name: string): string => `p_${NEWSLETTER_PLUGIN_ID}__${name}`;

export const NEWSLETTER_TABLE_NAMES = {
  lists: p("lists"),
  subscriptions: p("subscriptions"),
  audienceSnapshots: p("audience_snapshots"),
  sends: p("sends"),
  confirmationTokens: p("confirmation_tokens"),
} as const;

/**
 * ADR-023 §5/§6 — stable, unchanging provenance for this first-party bundled module (not an
 * externally-fetched artifact, so there is no real `sourceUrl`/signature to report; this fixed
 * value is what `checkNamespaceAdoption` compares against itself on every subsequent boot, which
 * is exactly what keeps every repeat boot on the `unchanged` track rather than requiring consent).
 */
const NEWSLETTER_PROVENANCE = { sourceUrl: "builtin://newsletter", publisher: "tovu-core" } as const;

/** The real, exact 5-table manifest (state.spec.md §2 row shapes → `ColumnDecl`s). */
export const NEWSLETTER_DATA_MODULE: DataModuleDecl = {
  pluginId: NEWSLETTER_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: NEWSLETTER_PROVENANCE,
  tables: [
    {
      name: "lists",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "name", type: "TEXT", notNull: true },
        { name: "slug", type: "TEXT", notNull: true },
        { name: "is_default", type: "INTEGER", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        { name: "created_at", type: "TEXT", notNull: true },
        { name: "updated_at", type: "TEXT", notNull: true },
      ],
    },
    {
      name: "subscriptions",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "list_id", type: "TEXT", notNull: true },
        { name: "subscriber_id", type: "TEXT", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        { name: "source", type: "TEXT", notNull: true },
        { name: "consent_revision_id_at_subscribe", type: "TEXT" },
        { name: "subscribed_at", type: "TEXT" },
        { name: "unsubscribed_at", type: "TEXT" },
        { name: "created_at", type: "TEXT", notNull: true },
        { name: "updated_at", type: "TEXT", notNull: true },
      ],
    },
    {
      name: "audience_snapshots",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "campaign_id", type: "TEXT", notNull: true },
        { name: "list_id", type: "TEXT", notNull: true },
        { name: "recipient_count", type: "INTEGER", notNull: true },
        { name: "created_at", type: "TEXT", notNull: true },
      ],
    },
    {
      name: "sends",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "campaign_id", type: "TEXT", notNull: true },
        { name: "audience_snapshot_id", type: "TEXT", notNull: true },
        { name: "subscriber_id", type: "TEXT", notNull: true },
        { name: "recipient_email", type: "TEXT", notNull: true },
        { name: "status", type: "TEXT", notNull: true },
        { name: "attempts", type: "INTEGER", notNull: true },
        { name: "idempotency_key", type: "TEXT", notNull: true },
        { name: "provider_message_id", type: "TEXT" },
        { name: "last_error", type: "TEXT" },
        { name: "next_attempt_at", type: "TEXT" },
        { name: "created_at", type: "TEXT", notNull: true },
        { name: "updated_at", type: "TEXT", notNull: true },
      ],
    },
    {
      name: "confirmation_tokens",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "subscription_id", type: "TEXT", notNull: true },
        { name: "token_hash", type: "TEXT", notNull: true },
        { name: "purpose", type: "TEXT", notNull: true },
        { name: "created_at", type: "TEXT", notNull: true },
        { name: "expires_at", type: "TEXT", notNull: true },
        { name: "consumed_at", type: "TEXT" },
      ],
    },
  ],
};

/**
 * Boot-time invocation (T011 wires the CALL SITE into `server/seed.ts`/`server/deps.ts`; this
 * function is the callee). Idempotent — `declareDataModule()`'s own skip-if-existing-tables logic
 * makes repeated boot calls safe (W-010).
 *
 * @throws if `declareDataModule()` reports `ok: false` — boot must NOT silently continue with a
 * half-installed Newsletter; the caller (composition root) surfaces this as a startup failure.
 */
export async function installNewsletterDataModule(
  required: { db: Database.Database; dbPath: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { db, dbPath } = required;
  const result = await declareDataModule({ db, dbPath, decl: NEWSLETTER_DATA_MODULE });
  if (!result.ok) {
    throw new Error(
      `newsletter dataModule declaration failed: ${result.error?.code} — ${result.error?.message}`
    );
  }
}
