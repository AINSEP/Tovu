import assert from "node:assert/strict";
import test from "node:test";

import { adminSections } from "../../../../admin-shell/navigation";

/**
 * @file REQ-01/REQ-22/REQ-27 (SPEC-019) — Recovery is a distinct admin screen at its own route,
 * never a tab inside the ADR-041 Database Timeline screen (renamed from "Storage" per that ADR's
 * own naming-correction note); no raw row-edit/SQL-console affordance lives under Recovery; the
 * pre-ADR-041 `/admin/backups`/`/admin/database` sitemap entries are superseded.
 *
 * Covers: AC-01 (route resolves independently), AC-02 (no inline tab/toggle into Recovery from
 * the Database Timeline screen — asserted here as "Recovery is its own top-level admin section,
 * not a child of any Database-Timeline-like section"), AC-32 (no raw-DB affordance anywhere in
 * Recovery's own section definition), AC-37/AC-38 (no `/admin/backups` entry remains; only the
 * Tier-3 browser, under the Database Timeline screen, remains of the raw `/admin/database` console
 * concept these ACs guard against — distinct from the real, renamed top-level Database nav entry
 * `apps/admin/src/nav.ts` now carries, which this legacy `src/admin-shell/navigation.ts` blueprint
 * never modeled and still does not).
 *
 * `adminSections` (`src/admin-shell/navigation.ts`) is EXISTING code this feature extends, not a
 * new file — confirmed via direct read that no `backups`/`database`/`recovery` section id exists
 * in the current codebase snapshot (ADR-PIPE-019 Brownfield Grounding). This test is expected to
 * fail today because the Recovery section does not yet exist — a correct red-phase failure for a
 * missing feature, not a compile/setup error.
 */

test("AC-01/AC-02: a distinct 'recovery' admin section exists, independent of any database/timeline section (never a child/tab of it)", () => {
  const recoverySection = adminSections.find((s) => s.id === "recovery");

  assert.ok(recoverySection, "expected a top-level 'recovery' admin section to exist (REQ-01)");
});

test("AC-37: no admin section or nav entry named/keyed 'backups' remains — the pre-ADR-041 path is fully superseded", () => {
  const backupsSection = adminSections.find((s) => s.id === "backups" || /backups/i.test(s.label));

  assert.equal(backupsSection, undefined, "REQ-27: /admin/backups must be fully superseded by /admin/recovery");
});

test("AC-38: this legacy admin-shell nav blueprint carries no raw-DB-console 'database' admin section — only the ADR-041 Tier-3 read-only browser (a sub-feature of the real Database Timeline screen, modeled separately in apps/admin/src/nav.ts) may remain, per REQ-22/REQ-27", () => {
  const databaseSection = adminSections.find((s) => s.id === "database" || /^database$/i.test(s.label));

  assert.equal(databaseSection, undefined, "src/admin-shell/navigation.ts (this legacy blueprint, distinct from apps/admin/src/nav.ts's real Database nav entry) must carry no standalone raw-DB-console nav entry; the Tier-3 browser is surfaced under the Database Timeline screen, not as its own top-level section here");
});

test("AC-32: the recovery section's own definition carries no raw row-edit/SQL-console description language", () => {
  const recoverySection = adminSections.find((s) => s.id === "recovery");
  assert.ok(recoverySection);

  const forbidden = /sql console|row.?edit|database.?first/i;
  assert.equal(forbidden.test(recoverySection?.description ?? ""), false);
});
