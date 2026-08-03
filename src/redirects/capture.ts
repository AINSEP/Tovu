/**
 * @file `RedirectSlugChangeCapture` — the `SlugChangeCapture` implementation
 * (SPEC-009 REQ-15/16/17; ADR-PIPE-009 Decision A).
 *
 * Purpose:
 * The single implementer of `routing`'s `SlugChangeCapture` slot. Inserts an
 * `active`, `source: 'auto_slug_change'`, `matchType: 'exact'` redirect rule +
 * its revision when an entry's routable slug/path changes, so no request can
 * observe the moved entry without its redirect already existing (INV-02).
 *
 * Correctness discipline (Decision A, load-bearing): this class performs NO
 * transaction control of its own — no `BEGIN`/`COMMIT`/`ROLLBACK` anywhere in
 * this file. It relies entirely on the caller (the content write chokepoint,
 * once wired — see tasks.md's "Known Scope Boundary": that wiring is OUT OF
 * SCOPE for this feature) already holding an open transaction on the same
 * single-connection `better-sqlite3` handle. Writes go through
 * `ports.internal.ts`'s `insertRedirectAndRevision`, the one shared,
 * non-tx-opening insert path this file and `redirects.ts` both use.
 *
 * Idempotency (REQ-17/AC-20): keyed off the routing-owned
 * `SlugChangeCaptureInput`'s `oldPath`/`newPath` rather than a `changeSetId`
 * DB column — `state.spec.md`'s frozen `RedirectRecord`/`RedirectRevision`
 * shapes (mirrored from the already-written `src/redirects/types.ts`) carry
 * no `changeSetId` field, so this reuses the existing
 * `RedirectRepoPort.findByFromPattern` read (already on the frozen `ports.ts`)
 * to detect "this exact slug-change was already captured": an existing
 * `active`, `source: 'auto_slug_change'` rule with `fromPattern === oldPath`
 * and `toTarget === newPath` means the same change was already captured, so a
 * retry is a no-op rather than a duplicate insert.
 *
 * Architectural role:
 * Feature logic. No Express/route code, no direct SQL — writes go through the
 * injected `RedirectDbHandle`; reads go through the injected `RedirectRepoPort`.
 */
import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import type { SlugChangeCapture, SlugChangeCaptureInput } from "../routing";

import { insertRedirectAndRevision, type RedirectDbHandle } from "./ports.internal";
import type { RedirectRecord, RedirectRevision } from "./types";

/**
 * The narrow read this capture needs — `RedirectRepoPort.findByFromPattern`
 * only (idempotency check). Declared as a `Pick` rather than the full
 * `RedirectRepoPort` so this file's dependency surface documents exactly what
 * it reads.
 */
export interface RedirectSlugChangeCaptureReadDeps {
  findByFromPattern(required: {
    workspaceId: string;
    fromPattern: string;
  }): Promise<RedirectRecord | null>;
}

export interface RedirectSlugChangeCaptureDeps {
  repo: RedirectSlugChangeCaptureReadDeps;
  db: RedirectDbHandle;
  clock: ClockPort;
  idGen: IdGeneratorPort;
}

/** Default priority/statusCode/override for an auto-captured rule (behavior.spec.md §3 analog). */
const AUTO_CAPTURE_STATUS_CODE = 301;
const AUTO_CAPTURE_PRIORITY = 0;

export class RedirectSlugChangeCapture implements SlugChangeCapture {
  constructor(private readonly deps: RedirectSlugChangeCaptureDeps) {}

  /**
   * Insert the auto-capture redirect rule for a slug change, or no-op if the
   * exact same change was already captured (idempotent retry, AC-20).
   *
   * MUST be called by a caller that already holds an open transaction on the
   * shared connection (or accepts the no-transaction-safety consequences of
   * calling it outside one) — this method never opens or closes one itself.
   *
   * @throws whatever `db.insertRedirect`/`db.insertRevision` throws,
   * uncaught, so the caller's own transaction aborts (REQ-16/EC-05).
   * @complexity O(1) — one read (idempotency check) + two writes.
   */
  async onSlugChange(input: SlugChangeCaptureInput): Promise<void> {
    const existing = await this.deps.repo.findByFromPattern({
      workspaceId: input.workspaceId,
      fromPattern: input.oldPath,
    });
    if (existing && existing.source === "auto_slug_change" && existing.toTarget === input.newPath) {
      // Same change already captured (retry of the same changeSetId) — idempotent no-op.
      return;
    }

    const now = this.deps.clock.nowIso();
    const id = this.deps.idGen.newId();

    const record: RedirectRecord = {
      id,
      workspaceId: input.workspaceId,
      matchType: "exact",
      fromPattern: input.oldPath,
      toTarget: input.newPath,
      statusCode: AUTO_CAPTURE_STATUS_CODE,
      status: "active",
      override: false,
      priority: AUTO_CAPTURE_PRIORITY,
      source: "auto_slug_change",
      sourceEntryId: input.entryId,
      fromPathAtCapture: input.oldPath,
      toPathAtCapture: input.newPath,
      createdByPrincipal: input.actor,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const revision: RedirectRevision = {
      redirectId: id,
      workspaceId: input.workspaceId,
      seq: 1,
      state: record,
      tombstoned: false,
      actorId: input.actor,
      recordedAt: now,
    };

    await insertRedirectAndRevision({ db: this.deps.db, record, revision });
  }
}
