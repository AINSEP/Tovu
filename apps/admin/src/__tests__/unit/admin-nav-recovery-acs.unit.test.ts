import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_PANELS } from "../../panels";

/**
 * @file REQ-01/REQ-22/REQ-27 (SPEC-019) — re-homed from
 * `src/features/recovery/__tests__/integration/recovery-route.integration.test.ts` (deleted
 * alongside the `src/admin-shell/` legacy blueprint it asserted against) onto the real registry,
 * `panels.tsx`'s `ADMIN_PANELS` — the thing `nav.ts`'s `getNav()` and `App.tsx` actually render.
 * The legacy blueprint was never wired to the shipped admin (see `nav.ts`'s own header on what it
 * replaced), so the original assertions proved nothing about the live app.
 *
 * The old filename was itself misleading: despite "recovery-route" in the name, none of its four
 * tests ever touched a route — all four read `adminSections`, a plain data array. Named for what
 * it actually checks here instead (nav/registry shape + one screen's own source text), not a route.
 *
 * AC-38 could not port verbatim: the legacy test asserted "no `database` id/label exists," but
 * `ADMIN_PANELS` deliberately has one — the real ADR-041 Database Timeline screen (renamed from
 * "storage" 2026-07; see `panels.tsx`'s own comment on that entry). That match is the AC's actual
 * intent too, per its own description ("only the ADR-041 Tier-3 read-only browser... may remain")
 * — the requirement was never "no database section," it was "no *second, raw-console* section
 * alongside it." Ported here as "exactly one `database` section, and nothing else shaped like a
 * standalone raw-console entry" rather than "none."
 *
 * AC-32 could not port against `panels.tsx` at all: the legacy `adminSections` entries carried a
 * free-text `description` field ("Restore points, the discarded-write-window disclosure...") that
 * `AdminPanel`/`AdminNavEntry` has no equivalent of (`panels.tsx` has zero `description` fields;
 * `AdminNavEntry` is exactly `label`/`icon?`/`group?`/`order?`/`soon?`) — a lookalike check against
 * `panels.tsx`'s own source comments would target *developer* comments, never shown to a user, and
 * could not fail in any way the original AC cared about. `features/recovery/Recovery.tsx` does carry a real,
 * rendered equivalent, though: the `<Recovery />` screen's own `page-description` copy (its actual
 * `/admin/recovery` page-header text) is the live analog of the deleted field. Ported AC-32 against
 * that string instead, as a source-text check (same pattern `nav-wiring.unit.test.ts`'s `RT-008`
 * case already uses) rather than a full render + API-mock test, since `Recovery`'s own render only
 * reaches that markup after two awaited `api.*` calls resolve.
 */

describe("REQ-01/REQ-22/REQ-27: recovery and database stay distinct, single, raw-console-free sections", () => {
  it("AC-01/AC-02: 'recovery' is its own top-level panel, distinct from 'database' — AdminPanel has no nesting concept, so distinct ids are the whole guarantee that one is never a child/tab of the other", () => {
    const recovery = ADMIN_PANELS.find((panel) => panel.id === "recovery");
    const database = ADMIN_PANELS.find((panel) => panel.id === "database");

    expect(recovery).toBeDefined();
    expect(database).toBeDefined();
    expect(recovery).not.toBe(database);
  });

  it("AC-37: no panel id or nav label named/keyed 'backups' remains — the pre-ADR-041 path is fully superseded", () => {
    const backups = ADMIN_PANELS.find(
      (panel) => panel.id === "backups" || /backups/i.test(panel.nav?.label ?? ""),
    );

    expect(backups).toBeUndefined();
  });

  it("AC-38: exactly one 'database' section exists, and no other panel is shaped like a standalone raw-DB-console", () => {
    const databasePanels = ADMIN_PANELS.filter(
      (panel) => panel.id === "database" || /^database$/i.test(panel.nav?.label ?? ""),
    );
    expect(databasePanels).toHaveLength(1);

    const rawConsoleLike = ADMIN_PANELS.filter(
      (panel) =>
        panel.id !== "database" &&
        /sql|console|raw.?db/i.test(`${panel.id} ${panel.nav?.label ?? ""}`),
    );
    expect(rawConsoleLike).toEqual([]);
  });

  it("AC-32: the Recovery screen's own rendered page-description copy carries no raw row-edit/SQL-console language", () => {
    const recoverySource = readFileSync(path.resolve(__dirname, "../../features/recovery/Recovery.tsx"), "utf8");

    const match = recoverySource.match(/className="page-description">([^<]*)</);
    expect(match).not.toBeNull();

    const pageDescription = match![1];
    expect(pageDescription.length).toBeGreaterThan(0);
    expect(/sql console|row.?edit|database.?first/i.test(pageDescription)).toBe(false);
  });
});
