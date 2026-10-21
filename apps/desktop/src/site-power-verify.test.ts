/** @file Tests for `site-power-verify.ts` — the layout geometry, flattened card view and profile seed
 *  behind the live site-card verifier. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { allLayoutClaimsHold, flat, layoutClaims, MISSING_BOX, NO_LAYOUT, seedSitePowerProfile } from "./site-power-verify.ts";
import type { Box, CardState } from "./site-power-verify.ts";

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

/** The owner's layout: name and ⋮ on row 1, SQLite and status level on row 2, power under SQLite. */
function card(layout: Partial<CardState["layout"]> = {}, rest: Partial<CardState> = {}): CardState {
  return {
    className: "card", name: "tovu-com", status: "Stopped", port: null,
    power: { label: "Start", disabled: false, visible: true },
    menuVisible: true, menuInTile: true, trashOnCard: false, actionsInBody: true, error: null,
    layout: {
      name: box(10, 10, 100, 30), menu: box(200, 12, 220, 28),
      details: box(10, 40, 80, 56), status: box(160, 41, 220, 55), power: box(10, 60, 70, 80),
      ...layout,
    },
    ...rest,
  };
}

test("the owner's layout satisfies all three claims, each naming its pixels", () => {
  const claims = layoutClaims(card());
  assert.deepEqual(Object.values(claims).map((claim) => claim.ok), [true, true, true]);
  assert.equal(allLayoutClaimsHold(claims), true);
  assert.equal(claims.onNameRow.why, "⋮ middle 20.0 vs name middle 20.0; ⋮ left 200.0 vs name right 100.0");
  assert.equal(claims.powerUnderText.why, "power left 10.0 vs SQLite left 10.0; power top 60.0 vs row 2 bottom 56.0");
  assert.match(claims.statusUnderMenu.why, /^status right 220\.0 vs ⋮ right 220\.0; status top 41\.0 vs ⋮ bottom 28\.0; status middle 48\.0 vs SQLite middle 48\.0$/);
});

test("each claim fails on its own geometry, within its own tolerance", () => {
  const off = (layout: Partial<CardState["layout"]>) => layoutClaims(card(layout));
  assert.equal(off({ menu: box(200, 16, 220, 32) }).onNameRow.ok, true, "4px centre drift is rounding");
  assert.equal(off({ menu: box(200, 17, 220, 33) }).onNameRow.ok, false, "5px is another row");
  assert.equal(off({ menu: box(90, 12, 110, 28) }).onNameRow.ok, false, "⋮ overlapping the name");
  assert.equal(off({ power: box(12, 60, 70, 80) }).powerUnderText.ok, false, "power not on SQLite's left edge");
  assert.equal(off({ power: box(10, 50, 70, 70) }).powerUnderText.ok, false, "power inside row 2");
  assert.equal(off({ status: box(160, 41, 218, 55) }).statusUnderMenu.ok, false, "status right edge off the ⋮");
  assert.equal(off({ status: box(160, 20, 220, 34) }).statusUnderMenu.ok, false, "status above the ⋮ bottom");
  assert.equal(off({ status: box(160, 50, 220, 64) }).statusUnderMenu.ok, false, "status not level with SQLite");
  assert.equal(allLayoutClaimsHold(off({ status: box(160, 50, 220, 64) })), false);
  assert.equal(allLayoutClaimsHold(off({ power: box(12, 60, 70, 80) })), false);
  assert.equal(allLayoutClaimsHold(off({ menu: box(90, 12, 110, 28) })), false);
});

test("a status with no power button makes no power-placement claim", () => {
  assert.deepEqual(layoutClaims(card({ power: null })).powerUnderText, { ok: true, why: "no power button for this status" });
});

test("no card, or a card missing any anchoring box, fails every claim with the reason", () => {
  assert.equal(layoutClaims(null), NO_LAYOUT);
  for (const missing of ["name", "menu", "details", "status"] as const) {
    assert.equal(layoutClaims(card({ [missing]: null })), NO_LAYOUT, missing);
  }
  assert.equal(allLayoutClaimsHold(NO_LAYOUT), false);
  assert.match(MISSING_BOX.why, /missing a name, a ⋮, a database line or a status/);
});

test("flat lifts the power button's fields and reports an absent card as all-undefined", () => {
  const view = flat(card({}, { status: "Running", port: "4100" }));
  assert.equal(view.label, "Start");
  assert.equal(view.disabled, false);
  assert.equal(view.hasPower, true);
  assert.equal(view.status, "Running");
  assert.equal(view.port, "4100");
  assert.ok(!("power" in view));
  const unpowered = flat(card({}, { power: null }));
  assert.deepEqual([unpowered.label, unpowered.disabled, unpowered.hasPower], [undefined, undefined, false]);
  assert.deepEqual(flat(null), {});
});

test("seeding refuses a missing or non-site directory, writing nothing", (t) => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "site-power-seed-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  for (const siteDir of [undefined, "", path.join(tmp, "not-a-site")]) {
    const lines: string[] = [];
    const name = seedSitePowerProfile({ siteDir, shotDir: path.join(tmp, "shots"), userDataDir: path.join(tmp, "profile") },
      { fs: { existsSync, readFileSync, mkdirSync, writeFileSync }, log: (line) => lines.push(line), now: () => new Date(0) });
    assert.equal(name, null);
    assert.deepEqual(lines, ["FAIL:: SITE_POWER_SITE_DIR must name a real Tovu site directory (one with config.json)"]);
  }
  assert.ok(!existsSync(path.join(tmp, "profile")));
});

test("seeding a real site creates the shot and profile dirs and adopts exactly that site", (t) => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "site-power-seed-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const siteDir = path.join(tmp, "scratch-site");
  mkdirSync(siteDir);
  writeFileSync(path.join(siteDir, "config.json"), JSON.stringify({ name: "Scratch Bakery" }));
  const lines: string[] = [];
  const name = seedSitePowerProfile({ siteDir, shotDir: path.join(tmp, "shots", "run"), userDataDir: path.join(tmp, "profile") },
    { fs: { existsSync, readFileSync, mkdirSync, writeFileSync }, log: (line) => lines.push(line), now: () => new Date("2026-10-21T12:00:00Z") });
  assert.equal(name, "Scratch Bakery");
  assert.deepEqual(lines, []);
  assert.ok(existsSync(path.join(tmp, "shots", "run")));
  assert.deepEqual(JSON.parse(readFileSync(path.join(tmp, "profile", "desktop-projects.json"), "utf8")), {
    projects: [{ siteDir, createdAt: "2026-10-21T12:00:00.000Z", origin: "adopted" }], dismissed: [],
  });
});
