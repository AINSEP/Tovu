/**
 * @file Port contracts for the local admin Trash (phase 1 — Posts, Comments, Media, Redirects).
 *
 * Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`. Read §1.1 before
 * changing anything here: the whole shape exists so that **a trash operation never round-trips the
 * entity payload, and listing the trash never reads the entity at all**. `widgets_trash_instance`
 * is the counter-example — it parses `fields_json` to flip a status, so it fails on exactly the
 * corrupt rows a user most wants gone.
 *
 * Two structural rules this file encodes by signature rather than by discipline:
 *
 *  1. `TrashPort.trash` takes `display` as a REQUIRED argument. The caller already holds the record
 *     (it loaded it for its own permission/version checks), so the snapshot comes from columns it
 *     has in hand. The port therefore cannot read the entity even if someone wanted it to.
 *  2. `TrashAdapter` has exactly `hide` / `unhide` / `purge`. There is deliberately **no
 *     `describe()`** — an adapter method that can throw on read would eventually be called from the
 *     list path and the list would start 500ing on corrupt rows. The way to make that impossible is
 *     for the method not to exist.
 *
 * INTERFACES + TYPES ONLY — no logic lives here.
 */

/**
 * Retention window for locally trashed items, in days.
 *
 * Stamped into `trashed_items.purge_after` at trash time rather than computed at read time, so
 * lowering this constant later can never retroactively purge something a user was already promised.
 */
export const TRASH_RETENTION_DAYS = 60;

/** Domain discriminator stored in `trashed_items.entity_type`. Open vocabulary — validated at the
 *  port, deliberately NOT a CHECK constraint, so a phase-2 domain needs an adapter and no migration. */
export type TrashEntityType = string;

/** The two display strings captured from columns at trash time. Never derived by the port. */
export interface TrashDisplay {
  title: string;
  subtitle?: string | null;
}

export interface TrashActor {
  principalId: string;
  pluginId?: string | null;
}

/**
 * Outcome of a marker flip.
 *
 * `version` is the entity's version AFTER the flip — that is what lands in
 * `trashed_items.entity_version` and what the sweeper's compare-and-delete later checks, so a
 * restore (which bumps the version again) always wins a race against a purge. `null` for a domain
 * with no version column.
 */
export type TrashMarkerResult =
  | { ok: true; version: number | null }
  | { ok: false; reason: "not-found" | "version-changed" };

/** Outcome of a physical row removal. */
export type TrashPurgeOutcome = "purged" | "version-changed" | "already-gone";

/**
 * One per domain. Built and registered into a plain `Map` at the composition root and resolved
 * **at call time**, never at registration time: this codebase's module registries (`ToolRegistry`,
 * routing's `phaseRegistry`) are append-only with no unregister, so anything that filters at
 * registration runs exactly once. Two real bugs already came from that.
 *
 * Implementations MUST be column-only SQL. No payload parse, no ORM entity hydration, no domain
 * write-service call that re-validates a record.
 */
export interface TrashAdapter {
  readonly entityType: TrashEntityType;

  /**
   * Move the domain's own marker to hidden.
   *
   * `at` is supplied by the caller rather than read from an adapter-local clock so the marker's
   * timestamp is byte-identical to the one the calling domain writes into its revision ledger.
   */
  hide(required: {
    workspaceId: string;
    entityId: string;
    at: string;
    expectedVersion: number | null;
  }): Promise<TrashMarkerResult>;

  /** Move it back. Same no-parse rule as {@link TrashAdapter.hide}. */
  unhide(required: {
    workspaceId: string;
    entityId: string;
    at: string;
    expectedVersion: number | null;
  }): Promise<TrashMarkerResult>;

  /** Physically remove the row. Compare-and-delete on `expectedVersion`. */
  purge(required: {
    workspaceId: string;
    entityId: string;
    expectedVersion: number | null;
  }): Promise<TrashPurgeOutcome>;
}

/** One row of the Trash list. Rendered entirely from the snapshot — no entity read. */
export interface TrashItem {
  id: string;
  workspaceId: string;
  entityType: TrashEntityType;
  entityId: string;
  trashedAt: string;
  purgeAfter: string;
  actorPrincipalId: string;
  actorPluginId: string | null;
  displayTitle: string;
  displaySubtitle: string | null;
  entityVersion: number | null;
}

export interface TrashPage {
  items: TrashItem[];
  /** Keyset cursor on `(trashed_at, id)`; `null` when the page is the last one. */
  nextCursor: string | null;
}

/** Per-item outcome of {@link TrashPort.purgeSelected}. */
export type PurgeItemOutcome =
  | "purged"
  | "already-gone"
  | "version-changed"
  | "not-found"
  | "adapter-unavailable";

export interface PurgeReport {
  purged: number;
  results: { id: string; outcome: PurgeItemOutcome }[];
}

/** Outcome of a restore. `adapter-unavailable` is honest degradation, not a throw: the row lists
 *  from its snapshot even when its plugin has been uninstalled. */
export type RestoreOutcome = "restored" | "not-found" | "version-changed" | "adapter-unavailable";

export interface TrashPort {
  /**
   * Hide the entity AND index it, as ONE transaction. There is deliberately no public seam that
   * performs only one of the two writes — a failure between them would leave an item that is in the
   * Trash and still live on the site, or hidden with no Trash row, which is unrecoverable from the UI.
   */
  trash(required: {
    workspaceId: string;
    entityType: TrashEntityType;
    entityId: string;
    actor: TrashActor;
    display: TrashDisplay;
    at: string;
    expectedVersion: number | null;
  }): Promise<TrashMarkerResult>;

  restore(required: {
    workspaceId: string;
    entityType: TrashEntityType;
    entityId: string;
    at: string;
  }): Promise<RestoreOutcome>;

  list(required: {
    workspaceId: string;
    now: string;
    entityTypes?: readonly TrashEntityType[];
    limit: number;
    cursor?: string | null;
  }): Promise<TrashPage>;

  /** HUMAN-ONLY. Never exposed as an agent tool — see `tool-registrations.ts`'s registry test. */
  purgeSelected(required: {
    workspaceId: string;
    ids: readonly string[];
    actor: TrashActor;
  }): Promise<PurgeReport>;
}

/**
 * The function a domain's delete path receives through its own dependency object.
 *
 * Pre-bound at the composition root with that domain's `entityType`, so `post.ts`,
 * `redirects.ts`, the comments write-service and the media route import **no trash type and no
 * trash module**. They know only that deleting is something they delegate.
 */
export type RemoveEntity = (required: {
  workspaceId: string;
  id: string;
  display: TrashDisplay;
  at: string;
  expectedVersion: number | null;
  actor: TrashActor;
}) => Promise<TrashMarkerResult>;

/** A claimed batch of due rows, handed to the sweeper. */
export interface TrashSweepClaim {
  id: string;
  workspaceId: string;
  entityType: TrashEntityType;
  entityId: string;
  entityVersion: number | null;
}

/**
 * Storage for `trashed_items`. Adapters: SQLite (built) + in-memory test double (built).
 *
 * Every method is column-only. Nothing here ever reaches into a domain table.
 */
export interface TrashRepoPort {
  /** Idempotent by `(workspace_id, entity_type, entity_id)` — re-trashing is a no-op, not a
   *  duplicate row. */
  insert(row: TrashItem): Promise<void>;

  findByEntity(required: {
    workspaceId: string;
    entityType: TrashEntityType;
    entityId: string;
  }): Promise<TrashItem | null>;

  findByIds(required: { workspaceId: string; ids: readonly string[] }): Promise<TrashItem[]>;

  /** Removes the index row. This IS the restore — there is no second marker to clear. */
  deleteById(required: { workspaceId: string; id: string }): Promise<void>;

  deleteByEntity(required: {
    workspaceId: string;
    entityType: TrashEntityType;
    entityId: string;
  }): Promise<void>;

  /** Excludes `purge_after <= now`: a dormant site shows nothing expired on its first render, with
   *  no wait for a sweep. */
  list(required: {
    workspaceId: string;
    now: string;
    entityTypes?: readonly TrashEntityType[];
    limit: number;
    cursor?: string | null;
  }): Promise<TrashPage>;

  /** Atomic claim of due, unleased rows across EVERY workspace in the file (the `purge_after`
   *  index is global for exactly this query). */
  claimDue(required: {
    now: string;
    leaseOwner: string;
    leaseUntil: string;
    limit: number;
  }): Promise<TrashSweepClaim[]>;

  /** Hands a claimed row back when its purge stood down, so the next pass can retry it. */
  releaseLease(required: { id: string }): Promise<void>;
}

/**
 * Runs `fn` inside one database transaction.
 *
 * MUST be reentrant: a domain whose delete path already opened a transaction (posts and redirects
 * both do — their marker write and revision-ledger append are one unit) calls straight through to
 * `remove`, and a nested `BEGIN IMMEDIATE` would throw. Passing through preserves both-or-neither
 * exactly, because a throw inside propagates to the outer `ROLLBACK`.
 */
export type TransactionRunner = <T>(fn: () => Promise<T>) => Promise<T>;
