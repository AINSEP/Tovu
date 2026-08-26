import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Regression coverage for the narrow-content-column layout audit (web-design pass,
 * 2026-08-26).
 *
 * Opening the assistant chat dock (`AssistantDock`) alongside a fully expanded sidebar rail
 * squeezes the admin's content column down to roughly 60% of the window — the combination the
 * owner actually works in. Two shared, widely-reused rules broke under that squeeze:
 *
 * - `/admin/plugins`'s TIER column rendered a `tier-3` pill that word-wrapped at the hyphen
 *   ("tier-" / "3"), because `.tier` (and the sibling `.status` pill class, same bug) never set
 *   `white-space: nowrap`.
 * - `/admin/taxonomy`'s "New term in <taxonomy>" form (`Taxonomy.tsx`'s `NewTermForm`) rendered its
 *   input + "Add term" + "Cancel" row via `.editor-actions { display: flex; ... }` with no
 *   `flex-wrap`. Every ancestor up to `.taxonomy-namespace-group` has `overflow: visible`, so once
 *   the row's content no longer fit on one line it did not scroll or clip — it bled out past the
 *   card's own left AND right border, the actual bug (the card and form's own border boxes measure
 *   as correctly nested; it was the row's rendered content that escaped both).
 *
 * All three are pure-CSS invariants (a `white-space`/`flex-wrap` declaration on a rule), the same
 * class of thing `sidebar-accordion-css.unit.test.ts` documents at length: no component test can
 * exercise the failure because it depends on real flex-wrap/overflow layout math jsdom does not
 * perform, so — like that file — this asserts the declaration exists as text over the stylesheet.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("narrow-content-column layout fixes", () => {
  it("keeps .tier pills on one line (Plugins' TIER column wrapped 'tier-3' into 'tier-' / '3' at narrow widths)", () => {
    const rule = /\.tier\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).toMatch(/white-space\s*:\s*nowrap/);
  });

  it("keeps .status pills on one line (same bug as .tier, shared across ~15 list screens)", () => {
    const rule = /\.status\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).toMatch(/white-space\s*:\s*nowrap/);
  });

  it("lets .editor-actions wrap instead of bleeding its input/button row past the parent card (Taxonomy's NewTermForm at narrow widths)", () => {
    const rule = /\.editor-actions\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).toMatch(/flex-wrap\s*:\s*wrap/);
  });
});
