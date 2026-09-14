import type Database from "better-sqlite3";

/**
 * @file SPEC-050 v0.3.0 (REQ-12, REQ-14, INV-07): the reset a wholesale copy of a `content.db` needs
 * before it boots as a different site.
 *
 * The marker migration records the workspaces that existed when it ran against THIS database file,
 * and `preserveLegacySiteTitles` pins exactly those to the legacy title (NC-3 = A, REQ-06). A byte copy
 * of the file carries the marker rows and the pin into another site's database, where they claim that
 * site existed before the feature shipped. Two paths make such copies, and both call this on the copy:
 * `duplicateSite` (`platform/site-dir/duplicate-content-db.ts`, REQ-12) and the container-deploy seed
 * (`development/scripts/seed-site.mjs`, REQ-14).
 *
 * What goes: every marker row, and every `core.site/title` workspace-layer row the pin wrote (its
 * `updated_by` is the pin's actor). What stays: a row anyone else wrote, such as an owner's own title
 * or an owner's reset, travels with the rest of the workspace's content.
 *
 * WHY THE THREE LITERALS ARE MIRRORED, NOT IMPORTED. Their sources are `features/settings/site-title.ts`
 * (`SITE_TITLE_NAMESPACE`, `SITE_TITLE_KEY`) and `server/runtime/configuration/seed.ts`
 * (`SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID`). `.dependency-cruiser.mjs` forbids `site-dir` from importing
 * `server/**` and flags `db/sqlite` value-importing feature internals, and `seed-site.mjs` loads this
 * file through tsx as a build script, where a leaf module keeps `@jini-ai/cms` out of its import graph.
 * `__tests__/reset-legacy-site-title-pin.test.ts` fails if any literal drifts from its source.
 */

/** Mirrors `SITE_TITLE_NAMESPACE`. */
export const SITE_TITLE_PIN_NAMESPACE = "core.site";
/** Mirrors `SITE_TITLE_KEY`. */
export const SITE_TITLE_PIN_KEY = "title";
/** Mirrors `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID`, the actor the pin is attributed to. */
export const SITE_TITLE_PIN_ACTOR = "system-settings-migration";

const MARKER_TABLE = "site_title_preexisting_workspaces";
const VALUES_TABLE = "setting_values_workspace";
const DEFINITIONS_TABLE = "setting_definitions";

export interface ResetLegacySiteTitlePinResult {
  /** `site_title_preexisting_workspaces` rows deleted, pending or resolved. */
  markerRowsDeleted: number;
  /** `core.site/title` workspace-layer rows deleted because the pin's actor wrote them. */
  pinRowsDeleted: number;
}

/**
 * Deletes every legacy-title marker row and every system-written `core.site/title` workspace value
 * from a COPIED `content.db`, in one transaction. Never run it on the database `migrate()` marked in
 * place: there the marker and the pin are correct (REQ-06).
 *
 * Tolerates absent tables, so a copy taken before the marker migration existed resets what it has
 * instead of failing.
 *
 * @param required.db - an open, writable connection to the copy.
 * @returns how many rows of each kind were deleted.
 * @throws whatever better-sqlite3 throws for a failed statement. The transaction rolls back; neither
 *   caller swallows the error.
 * @complexity O(m + v) for m marker rows and v workspace-layer value rows (`updated_by` is not
 *   indexed), once per copy.
 */
export function resetLegacySiteTitlePin(required: { db: Database.Database }): ResetLegacySiteTitlePinResult {
  const { db } = required;
  const present = new Set(
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)")
        .all(MARKER_TABLE, VALUES_TABLE, DEFINITIONS_TABLE) as Array<{ name: string }>
    ).map((row) => row.name)
  );

  const reset = db.transaction(
    (): ResetLegacySiteTitlePinResult => ({
      markerRowsDeleted: present.has(MARKER_TABLE) ? db.prepare(`DELETE FROM ${MARKER_TABLE}`).run().changes : 0,
      pinRowsDeleted:
        present.has(VALUES_TABLE) && present.has(DEFINITIONS_TABLE)
          ? db
              .prepare(
                `DELETE FROM ${VALUES_TABLE} WHERE updated_by = ? AND setting_id IN (SELECT setting_id FROM ${DEFINITIONS_TABLE} WHERE namespace = ? AND key = ?)`
              )
              .run(SITE_TITLE_PIN_ACTOR, SITE_TITLE_PIN_NAMESPACE, SITE_TITLE_PIN_KEY).changes
          : 0,
    })
  );
  return reset();
}
