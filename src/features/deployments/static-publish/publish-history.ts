import type { UUID } from "@jini-ai/cms/core";

import type { StaticPublishTargetId } from "./types";
import { resolvePublishHistoryListLimit } from "../../../core/publish-history-list-limit";

/**
 * @file Durable, append-only publish-history ledger — the fix for Defect 2 (2026-08-16 live-publish
 * finding): the site went live at `https://leonaburime-ucla.github.io/tovu-demo/`, and the assistant
 * still had nowhere to look that up. `publish-run.ts`'s own `currentRun` snapshot answers "is a
 * publish running right now", not "what did the last SUCCESSFUL one produce" — it resets to
 * `IDLE_RUN` on every process restart, and even mid-process it only remembers the single most recent
 * run for the whole server, not one entry per target. `deployment_list` (`../agent-tools.ts`) is a
 * genuinely different subsystem — provider-driven continuous-deployment records, not this feature's
 * one-shot static publishes — and says so in its own tool description.
 *
 * REWORK (2026-08-16, owner-requested): the original fix for Defect 2 shipped a flat JSON file under
 * `infra/publish-history/`, one file per workspace, one entry per `(workspace, target)` — "last
 * publish wins," deliberately not a log. The owner reviewed that and rejected it: a publish is a
 * record (what shipped, when, to where, triggered by what), not a cache, and a record belongs in the
 * database — durable across a restart the same way the file was, but ALSO queryable, joinable, and
 * capable of ever backing a real "publish history" view, which a single-row-per-target design can
 * never do (every publish after the first overwrites the one before it). The prior design's own
 * stated reason for staying file-backed — "adding a DB table needs a migration, and migrations
 * belong to whichever dispatch owns `drizzle/` for this session" — was a scheduling convenience
 * across two concurrently-dispatched agents, not an architectural argument, and does not survive
 * being named explicitly. This file, `publish-run.ts`, `src/db/schema.ts`'s `publishHistory` table,
 * and `src/db/sqlite/publish-history-repo.sqlite.ts` are that rework.
 *
 * Purpose:
 * {@link PublishHistoryStore} is the port — `getLast` (the single most recent row for a
 * `(workspace, target)` pair, what `deployment_get_static_publish_capabilities` surfaces as
 * `lastPublish`) and `list` (newest-first, workspace-scoped, optionally target-scoped — what a future
 * history UI would page through). {@link InMemoryPublishHistoryStore} is the test double, append-only
 * like the real table (a test asserting "the second publish did not erase the first" needs an
 * in-memory double that can actually fail that assertion). `SqlitePublishHistoryStore`
 * (`src/db/sqlite/publish-history-repo.sqlite.ts`, this feature's real ADR-006 rule-of-two second
 * adapter) is the production implementation — it lives under `src/db/sqlite/`, not here, matching
 * every other DB-backed port/adapter split in this codebase (`PublishCredentialSetRepoPort` here in
 * `features/deployments/`, `SqlitePublishCredentialSetRepo` there in `db/sqlite/`).
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic — this file declares the port and its in-memory
 * test double only; no Drizzle/SQL import belongs here (that is the adapter's job, one layer down).
 * `publish-run.ts` is the ONE place a `PublishHistoryStore` is written to (both its shared entry
 * points — the admin route's fire-and-forget `startPublishRun` and the agent tool's awaited
 * `runPublishAndAwait` — settle through the same function, so both callers record identically with no
 * change needed at either call site). `publish-agent-tools.ts`'s capabilities handler is the one
 * place `getLast` is read from today, surfaced per provider as `lastPublish`.
 */

/** Which of this feature's two entry points produced a given {@link PublishHistoryEntry} — the admin
 *  UI's Static Site tab (`publish-site.ts`'s HTTP trigger route, via `startPublishRun`) or the
 *  assistant's confirmed publish tool (`publish-agent-tools.ts`'s `deployment_execute_static_publish`,
 *  via `runPublishAndAwait`). Free to compute at the source: `publish-run.ts`'s two entry functions
 *  each hardcode their own literal when calling into history recording, since which caller reached
 *  which function IS the answer — no request-scoped or caller-supplied value is needed. */
export type PublishTrigger = "admin_ui" | "agent_tool";

/** One recorded publish — a row in the append-only ledger, not a cache slot. `owner`/`repo`/`branch`/
 *  `commitSha` are present only for `github-pages` (`StaticPublishConfig`'s own per-target field
 *  split — see `types.ts`); every other target carries none of the four. `commitSha` specifically is
 *  NOT a placeholder that is always empty for every other target because it could not be obtained —
 *  it genuinely does not exist for them (Vercel/Netlify/Cloudflare Pages publishes are not git
 *  commits); see `publish-run.ts`'s `toHistoryEntry` for where this is derived and verified against
 *  `@jini-ai/devops`'s own `GitHubPagesDeployTarget.publish()`. */
export interface PublishHistoryEntry {
  readonly target: StaticPublishTargetId;
  readonly url: string;
  /** `false` only for the s3-compatible "uploaded, not yet confirmed reachable" partial outcome
   *  (`StaticPublishOutcome`'s own `ok: "partial"` branch) — everything else that reaches this store
   *  at all is a full, confirmed-live success (see {@link PublishHistoryStore.recordSuccess}'s own
   *  doc: an `ok: false` outcome is never recorded, so `reachable` is never "the publish failed"). */
  readonly reachable: boolean;
  readonly status: string;
  readonly projectName: string;
  readonly publishedAt: string;
  readonly owner?: string;
  readonly repo?: string;
  readonly basePath?: string;
  /** The provider's own opaque identifier for this publish — `StaticPublishOutcome.deploymentId`,
   *  verbatim, whatever it means for that target (a Vercel/Netlify/Cloudflare deploy id, or, for
   *  github-pages, the same commit sha `commitSha` below also carries). Absent when the outcome
   *  carried none (s3-compatible has no `deploymentId` at all). */
  readonly deploymentId?: string;
  /** github-pages only — see this interface's own header. */
  readonly commitSha?: string;
  /** github-pages only — the branch actually published to. */
  readonly branch?: string;
  readonly triggeredBy: PublishTrigger;
}

/** Workspace-and-target-scoped read/write for the publish-history ledger. */
export interface PublishHistoryStore {
  /** The single most recent recorded publish for `(workspaceId, target)`, or `null` if none has ever
   *  been recorded — what `deployment_get_static_publish_capabilities` surfaces as `lastPublish`. */
  getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null>;
  /** Every recorded publish for `workspaceId`, newest first, optionally narrowed to one `target` —
   *  what a future read-only history view would page through. `limit` defaults to
   *  `DEFAULT_PUBLISH_HISTORY_LIST_LIMIT` and is clamped to `MAX_PUBLISH_HISTORY_LIST_LIMIT`
   *  (`core/publish-history-list-limit.ts`) regardless of what a caller requests: this table is
   *  append-only and grows for the life of an install (`REVIEWED_INTEGER_ID_COLUMNS` in
   *  `db/migration/manifest.ts` reviews `publish_history.id` as `"unbounded"` for exactly this
   *  reason), so an unbounded `list` call is a real resource-exhaustion risk a workspace with years of
   *  publish history could actually trigger, not a hypothetical one. */
  list(input: { workspaceId: UUID; target?: StaticPublishTargetId; limit?: number }): Promise<PublishHistoryEntry[]>;
  /** Appends a new row — an append-only ledger, never a replace-in-place. Named for what it is ever
   *  called with, not what it is capable of rejecting: an `ok: false` `StaticPublishOutcome` is never
   *  passed to it at all (the caller, `publish-run.ts`'s `toHistoryEntry`, decides that, not this
   *  port), so `recordSuccess` never means "the publish failed." */
  recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void>;
}

/** Test double — append-only like the real table (a `Map<key, PublishHistoryEntry[]>`, not
 *  `Map<key, PublishHistoryEntry>`), so a test can actually assert "the second publish did not erase
 *  the first." Dies on process restart, same as any in-memory double; production always uses
 *  `SqlitePublishHistoryStore` instead (`server/deps.ts`), never this class. */
export class InMemoryPublishHistoryStore implements PublishHistoryStore {
  private readonly entriesByWorkspace = new Map<UUID, PublishHistoryEntry[]>();

  async getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null> {
    const rows = this.entriesByWorkspace.get(input.workspaceId) ?? [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i]!.target === input.target) return rows[i]!;
    }
    return null;
  }

  async list(input: { workspaceId: UUID; target?: StaticPublishTargetId; limit?: number }): Promise<PublishHistoryEntry[]> {
    const limit = resolvePublishHistoryListLimit(input.limit);
    const rows = this.entriesByWorkspace.get(input.workspaceId) ?? [];
    const matching = input.target === undefined ? rows : rows.filter((row) => row.target === input.target);
    // Newest-first: entries are appended oldest-to-newest, so reverse before slicing to `limit`.
    return matching.slice().reverse().slice(0, limit);
  }

  async recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void> {
    const rows = this.entriesByWorkspace.get(input.workspaceId) ?? [];
    rows.push(input.entry);
    this.entriesByWorkspace.set(input.workspaceId, rows);
  }
}
