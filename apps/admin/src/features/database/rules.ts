import type { AdminSchemaState } from "../../lib/api";
import type { QueryKey } from "../../lib/fetch-query";

/**
 * @file Pure logic for the `database` feature — everything that computes a value rather than
 * rendering one. New file: this feature had no `rules.ts` before this migration, since none of its
 * three sections had computed logic worth extracting until `KEYS` needed a shared home.
 *
 * `KEYS` (fetch-query migration, 2026-08-12): `restorePoints` and `timeline` are two independent
 * resources — `use-restore-points-section.hooks.ts`'s create action never reloaded the timeline in
 * the pre-migration code either (each section owns its own load, no cross-invalidation), so they
 * get two entirely separate top-level namespaces rather than a shared grandparent, same shape
 * `forms/rules.ts`'s `KEYS` uses for `forms` vs `form-submissions`.
 *
 * `timeline(filters)` keys on the four filter fields together, not on a separate "applied" flag —
 * `use-timeline-section.hooks.ts` keeps a `kind`/`outcome`/`fromDate`/`toDate` DRAFT (bound to the
 * filter form's own inputs) separate from the `appliedFilters` state this key is built from, so
 * typing into a filter field does not itself trigger a reload — only `applyFilters` committing the
 * draft into `appliedFilters` does, matching the pre-migration `applyFilters`'s explicit
 * `load(true)` call. `useFetchMutation`'s `no invalidates` case: this feature also has
 * `use-migrate-forward-section.hooks.ts`'s plan/confirm/execute ceremony, which has no read of its
 * own to cache (no `KEYS` entry needed for it) — see that hook's own doc comment.
 */
export const KEYS = {
  schemaState: ["database", "schema-state"] as QueryKey,
  restorePoints: ["database", "restore-points"] as QueryKey,
  timeline: (filters: { kind: string; outcome: string; fromDate: string; toDate: string }): QueryKey => [
    "database",
    "timeline",
    filters.kind,
    filters.outcome,
    filters.fromDate,
    filters.toDate,
  ],
};

/** How loudly the Database screen's drift warning presents itself. Maps onto the two `.notice`
 *  variants `styles.css` already ships (`.notice.error` / `.notice.warning`) — no new CSS. */
export type SchemaStateWarningTone = "error" | "warning";

/**
 * One drift warning, as untranslated English copy. `title`/`body` are the raw dictionary KEYS
 * (`database-i18n.tsx`'s convention) — the component passes each through `t()`, so this stays a
 * pure function with no locale in it.
 */
export interface SchemaStateWarning {
  tone: SchemaStateWarningTone;
  title: string;
  body: string;
}

/** The "we asked, and we still do not know" outcome. Shared by every non-answer below so the three
 *  distinct ways of not knowing (request failed, comparison incomplete, status unrecognised) can
 *  differ in `body` while presenting identically. */
const COULD_NOT_CHECK_TITLE = "We could not check your database";

/**
 * Decides whether the Database screen shows a drift warning, and which one.
 *
 * WHY A DEFAULT-TO-LOUD SHAPE: this function is the human-facing end of `src/db/drift.ts`'s
 * classification, which until now had no UI at all. Its governing rule is therefore negative — the
 * ONLY inputs that return `null` are a confirmed `"in-sync"` read and the pre-first-read state
 * (`state: null` with no error), where nothing has been claimed yet. Everything else returns a
 * visible banner, including inputs that represent ignorance rather than trouble. An absent banner
 * on this screen reads as "your database is fine", so anything less than a confirmed-clean answer
 * must not produce one. That is the same discipline `adapter.sqlite.ts` states server-side ("never
 * fabricated") carried through to the pixel.
 *
 * PRECEDENCE: `error` is checked before `state`, so a stale successful read cannot mask a check
 * that has just failed — a previous "in-sync" is not evidence about now.
 *
 * The `default` branch is deliberately reachable: `status` arrives as JSON off the wire, so its
 * TypeScript union is a claim about the server, not a runtime guarantee. A future status this
 * build has never heard of resolves to "could not check" rather than falling through to silence.
 *
 * @complexity O(1).
 */
export function resolveSchemaStateWarning(
  required: { state: AdminSchemaState | null; error: string | null },
  _optional: Record<string, never> = {},
): SchemaStateWarning | null {
  const { state, error } = required;

  if (error) {
    return {
      tone: "warning",
      title: COULD_NOT_CHECK_TITLE,
      body: "This check did not finish, so we cannot tell whether your database is up to date. Try reloading the page.",
    };
  }
  if (!state) return null;

  switch (state.status) {
    case "in-sync":
      return null;
    case "diverged":
      return {
        tone: "error",
        title: "Your database does not match the software running this site",
        body: "This site's data was set up by a different version of the software than the one running now. Saving changes may not work correctly. Check with whoever manages this site before making further changes.",
      };
    case "ahead":
      return {
        tone: "warning",
        title: "Your database is newer than the software running this site",
        body: "This site's data was set up by a newer version of the software than the one running now. Some features may not work until this site is updated.",
      };
    case "behind":
      return {
        tone: "warning",
        title: "Your database is out of date",
        body: "The software running this site is newer than the setup of this site's data. Use Migrate forward below to bring it up to date.",
      };
    case "unknown":
      return {
        tone: "warning",
        title: COULD_NOT_CHECK_TITLE,
        body: "One of the two records we compare is missing, so we cannot tell whether your database is up to date. That is not itself a sign of a problem — but nothing has been confirmed either.",
      };
    default:
      return {
        tone: "warning",
        title: COULD_NOT_CHECK_TITLE,
        body: "This site reported a status this version of the admin does not recognise, so we cannot tell whether your database is up to date.",
      };
  }
}
