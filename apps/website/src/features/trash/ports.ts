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
 *
 * `priorMarker` is OPTIONAL and additive (migration 0072): a status-marker adapter (`menu`, `term`,
 * `taxonomy`) reports the status the row carried immediately before `hide` flipped it to `trash`, so
 * `restore` can put it back exactly rather than to a fixed fallback. A caller that omits the key
 * entirely (every adapter today) keeps the exact `{ ok: true, version }` shape — do not set this to
 * `undefined`; leave the key out. `trash.contract.test.ts`'s pinned `assert.deepEqual(trashed, {
 * ok: true, version: 2 })` depends on that: Node's `assert.deepEqual` treats an extra own-enumerable
 * property, even one valued `undefined`, as a mismatch.
 *
 * `noop` is OPTIONAL and additive (T1c, `follow-ups.test.ts`): `table-adapter.ts`'s `hide`/`unhide`
 * set it to `true` on their idempotent "already in the target state" branch — the ONE signal that
 * distinguishes that branch from a real transition, both of which otherwise report the same
 * `ok: true`. `withFollowUps` (`follow-ups.ts`) reads it to decide whether a hook actually finished
 * something. Same leave-the-key-out rule as `priorMarker`: a real transition and every bespoke
 * adapter (post/comment/media/redirect) never set it, so their pinned exact-shape assertions are
 * unaffected.
 *
 * `"blocked"` (T1 item 2, migration-free — no new column) is a THIRD failure reason, alongside
 * `"not-found"`/`"version-changed"`: the row exists and the version matches, but the entry's
 * `TrashBlockerSpec` found rows that must move or be deleted first (a term with child terms). `code`
 * and `count` are always present together on this branch — see `registry.ts`'s `TrashBlockerSpec`.
 */
export type TrashMarkerResult =
  | { ok: true; version: number | null; priorMarker?: string | null; noop?: true }
  | { ok: false; reason: "not-found" | "version-changed" }
  | { ok: false; reason: "blocked"; code: string; count: number };

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
    /** Who performed the trash, so an adapter that records its own audit event (the user adapter)
     *  can attribute it. Optional and additive — every other adapter ignores it. */
    actor?: TrashActor;
  }): Promise<TrashMarkerResult>;

  /**
   * Move it back. Same no-parse rule as {@link TrashAdapter.hide}.
   *
   * `priorMarker` (migration 0072) is what {@link TrashItem.priorMarker} stored at trash time —
   * additive and optional, so every adapter's existing signature stays structurally compatible. A
   * status-marker adapter restores to `priorMarker ?? restoreFallback`; a timestamp-marker adapter
   * (every adapter today) ignores it, since clearing the marker column needs no prior value.
   */
  unhide(required: {
    workspaceId: string;
    entityId: string;
    at: string;
    expectedVersion: number | null;
    priorMarker?: string | null;
    /** See {@link TrashAdapter.hide}'s `actor`. */
    actor?: TrashActor;
  }): Promise<TrashMarkerResult>;

  /** Physically remove the row. Compare-and-delete on `expectedVersion`. */
  purge(required: {
    workspaceId: string;
    entityId: string;
    expectedVersion: number | null;
    /** See {@link TrashAdapter.hide}'s `actor`. */
    actor?: TrashActor;
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
  /** The status-marker value the entity carried immediately before `trash` flipped it (migration
   *  0072) — required and nullable, same pattern as {@link TrashItem.entityVersion}: `null` for a
   *  timestamp-marker entity (there is nothing to restore to) and for every row trashed before this
   *  column existed. Written by {@link TrashPort.trash}, read back by {@link TrashPort.restore}. */
  priorMarker: string | null;
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
  | "adapter-unavailable"
  | "forbidden";

/**
 * Decides whether the caller may permanently destroy ONE already-resolved trash row.
 *
 * Purge addresses rows by trash row id, and the per-kind permission has to be checked against the
 * kind the STORED row actually has. A caller that supplied the kind alongside the id could name
 * `comment` for a post's row and destroy a post holding only `comments.moderate`. So the gate is
 * handed the row `purgeSelected` looked up, inside the same call that then purges it — which closes
 * the read-then-act window as well as the escalation.
 *
 * Returning `false` (rather than throwing) keeps a denial a per-item outcome: one forbidden row in
 * a hand-ticked selection must not abort the rows the caller may destroy.
 */
export type TrashItemAuthorizer = (item: TrashItem) => Promise<boolean>;

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
    /**
     * The state a restore should bring back, stated by the caller for an entity whose marker column
     * cannot say it (an adopted legacy widget: its real state lives in its payload). Stored only
     * when the adapter's `hide` reports no `priorMarker` of its own — the marker column wins.
     */
    priorMarker?: string | null;
  }): Promise<TrashMarkerResult>;

  restore(required: {
    workspaceId: string;
    entityType: TrashEntityType;
    entityId: string;
    at: string;
    /** See {@link TrashAdapter.hide}'s `actor`. Optional — a caller that omits it (every existing
     *  call site until the trash restore route) gets the exact same behavior as before this field
     *  existed. */
    actor?: TrashActor;
  }): Promise<RestoreOutcome>;

  list(required: {
    workspaceId: string;
    now: string;
    entityTypes?: readonly TrashEntityType[];
    limit: number;
    cursor?: string | null;
  }): Promise<TrashPage>;

  /**
   * HUMAN-ONLY. Never exposed as an agent tool — see `tool-registrations.ts`'s registry test.
   *
   * `authorizeItem` is REQUIRED, not optional. A permission check a call site may omit is a
   * permission check some call site eventually omits, and this operation is the one that cannot be
   * undone. See {@link TrashItemAuthorizer} for why the gate takes the resolved row.
   */
  purgeSelected(required: {
    workspaceId: string;
    ids: readonly string[];
    actor: TrashActor;
    authorizeItem: TrashItemAuthorizer;
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
  /** See `TrashPort.trash`'s `priorMarker`. */
  priorMarker?: string | null;
}) => Promise<TrashMarkerResult>;

/**
 * The function a domain's delete path receives to DROP an index row.
 *
 * Needed by any domain that can leave the trashable state by a route other than a Trash-screen
 * restore or purge: a comment approved back out of `trash` by ordinary moderation, a media asset
 * hard-purged from the admin delete rung. Without it the index row outlives the condition it
 * records, and the Trash screen offers a Restore or a permanent delete for something that is either
 * live again or already gone.
 *
 * NOT a half of {@link TrashPort.trash}. It writes no marker and hides nothing — it only forgets a
 * removal that some other owner has already undone or completed.
 */
export type ForgetRemovedEntity = (required: { workspaceId: string; id: string }) => Promise<void>;

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
