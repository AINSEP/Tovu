import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import { SqlChangeSetRepo } from "@jini-ai/db/events";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted names; the change-set repo's header, items and co-persisted outbox row use the same wiring. */
export const CHANGE_SET_TABLES = { changeSets: "change_sets", changeSetItems: "change_set_items", outboxEvents: "outbox_events" } as const;

// The repo's design header, as it stood in this repo before the repo moved to Jini `@jini-ai/db/events` (S6a); it still holds the
// transaction-participation scope of `insert()`.
/**
 * @file SPEC-023 / ADR-046 Phase 1 — THE `ChangeSetRepoPort` adapter: one Kysely query body for every
 * dialect (storage plan §4, ADR-066). ADR-006 rule-of-two "second adapter" half;
 * Jini `@jini-ai/cms/core/commands`'s `InMemoryChangeSetRepo` is the first.
 * `sqlite/change-set-repo.sqlite.ts` is the thin subclass the composition root builds.
 *
 * Purpose:
 * Change-set mutation history (ADR-008's audit/undo trail) previously lived only in-memory in the
 * real running server (`apps/website/src/server/runtime/composition/deps.ts`), lost on every restart — ADR-046's Context section names
 * this explicitly as unacceptable for user-visible state. This adapter closes that gap.
 *
 * Transaction-participation scope (disclosed, deliberate): `insert()` writes the change-set header,
 * its items, AND (BR-04 resolution, 2026-07-16 swarm debate — full record:
 * `ADS-memory/reports/swarm-consensus/runs/20260716T-br04-outbox-seam-consensus-report.md`)
 * its optional outbox event, as ONE atomic kernel transaction — none of the three rows can ever
 * partially land. This does NOT extend to wrapping the *domain* mutation's own write in the same
 * transaction as this repo's insert — `core/commands/command.ts`'s `executeCommand()` keeps its
 * existing capture-then-compensating-rollback design unchanged for the domain write (ADR-046 Phase
 * 1's own instruction for this row: "migrate existing local semantics without changing route
 * contracts"). Unifying the domain write and this repo's write into one shared transaction would
 * mean threading a transaction handle through every `CommandMutation.execute()` across the whole
 * codebase — that is Phase 3 (composition-root rework) territory, not this row's job.
 *
 * Architectural role:
 * Infrastructure adapter. `core/commands` never imports this file — it depends only on
 * `ChangeSetRepoPort`; composition roots (`apps/website/src/server/runtime/composition/deps.ts`) bind the concrete class.
 */

/**
 * @file The change-set repo on a site's SQLite `content.db`: {@link SqlChangeSetRepo} (the one
 * Kysely query body, in Jini `@jini-ai/db/events`), kept as a named class so the composition root
 * that builds it from the content db handle stays as it is.
 */
export class SqliteChangeSetRepo extends SqlChangeSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: CHANGE_SET_TABLES }, {});
  }
}
