import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_THEME_ID, resolveActiveTheme } from "../active-theme.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Certifies {@link resolveActiveTheme} — "given the discovered themes and a stored active
 * theme id, which theme actually renders".
 *
 * The regression this file exists to prevent: the resolver's fallback used to be
 * `deps.themes.find((t) => t.status === "valid")`, i.e. *whatever theme sorts first alphabetically*,
 * because discovery sorts by `manifest.id.localeCompare` (`theme.ts`'s `discoverAllBuiltInThemes`).
 * `basic` won on every real site purely by coincidence of naming — installing a theme called
 * `aurora` would have silently made IT the default for every site whose configured theme no longer
 * resolved. `seed.ts` documented that exact bug and routed around it by hardcoding `"basic"` into
 * the seeded row rather than fixing the resolver.
 *
 * Every fallback case below therefore puts a VALID theme that sorts before `basic` at the head of
 * the list. A test whose list happens to be ordered with `basic` first would pass under the old
 * arbitrary-order behaviour too and would certify nothing.
 */

function makeTheme(id: string, status: DiscoveredTheme["status"] = "valid"): DiscoveredTheme {
  return {
    manifest: { id, name: id, version: "1.0.0", tier: "static", engine: 1 },
    dir: `/fake/${id}`,
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {},
    partials: {},
    css: "",
    source: "site",
    status,
    errors: [],
  } as unknown as DiscoveredTheme;
}

/** Discovery order: `aurora` sorts before `basic`, exactly as `localeCompare` would place it. */
function sortedThemes(...ids: string[]): DiscoveredTheme[] {
  return [...ids].sort((a, b) => a.localeCompare(b)).map((id) => makeTheme(id));
}

test("the constant is a name, and it is the id the stock theme actually ships under", () => {
  assert.equal(DEFAULT_THEME_ID, "basic");
});

test("step 1: a configured, valid theme wins over the named default", () => {
  const themes = sortedThemes("aurora", "basic", "storefront");
  assert.equal(resolveActiveTheme({ themes }, "storefront")?.manifest.id, "storefront");
});

test("step 2: an unresolvable configured id falls back to the NAMED default, not the first valid theme", () => {
  // `aurora` is valid AND sorts first — the old resolver returned it here.
  const themes = sortedThemes("aurora", "basic", "storefront");
  assert.equal(resolveActiveTheme({ themes }, "deleted-theme")?.manifest.id, DEFAULT_THEME_ID);
});

test("step 2: a configured theme that discovery marked invalid also falls back to the named default", () => {
  const themes = [makeTheme("aurora"), makeTheme("basic"), makeTheme("broken", "invalid")].sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id)
  );
  assert.equal(resolveActiveTheme({ themes }, "broken")?.manifest.id, DEFAULT_THEME_ID);
});

test("step 2 does not fire for an INVALID default: an unloadable `basic` is not rendered", () => {
  // The named default must clear the same `status === "valid"` bar the configured theme does,
  // otherwise this change would make a site render a theme the old code correctly refused.
  const themes = [makeTheme("aurora"), makeTheme("basic", "invalid")];
  assert.equal(resolveActiveTheme({ themes }, "deleted-theme")?.manifest.id, "aurora");
});

test("step 3 (unchanged): no default installed at all still falls through to the first valid theme", () => {
  const themes = sortedThemes("aurora", "storefront");
  assert.equal(resolveActiveTheme({ themes }, "deleted-theme")?.manifest.id, "aurora");
});

test("step 3 (unchanged): with no valid theme anywhere, the first discovered theme is still returned", () => {
  const themes = [makeTheme("aurora", "invalid"), makeTheme("storefront", "invalid")];
  assert.equal(resolveActiveTheme({ themes }, "deleted-theme")?.manifest.id, "aurora");
});

test("step 3 (unchanged): an empty discovery list is still `null`", () => {
  assert.equal(resolveActiveTheme({ themes: [] }, "basic"), null);
});

/**
 * The fallback used to be silent, which is the only reason the arbitrary-order bug survived long
 * enough to be worked around in `seed.ts` instead of fixed. These certify that each degraded step
 * announces itself and names the ids an operator needs to act on.
 */

function captureWarnings(t: import("node:test").TestContext): string[] {
  const lines: string[] = [];
  t.mock.method(console, "warn", (message: unknown) => {
    lines.push(String(message));
  });
  return lines;
}

test("step 1 is silent — a healthy site must not log on every request", (t) => {
  const warnings = captureWarnings(t);
  resolveActiveTheme({ themes: sortedThemes("aurora", "basic") }, "basic");
  assert.deepEqual(warnings, []);
});

test("step 2 warns, naming the configured id that vanished AND the default it fell back to", (t) => {
  const warnings = captureWarnings(t);
  resolveActiveTheme({ themes: sortedThemes("aurora", "basic") }, "deleted-theme");

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /deleted-theme/);
  assert.match(warnings[0] ?? "", /basic/);
});

test("step 3 warns that the default is gone too — a strictly worse state than step 2, said differently", (t) => {
  const warnings = captureWarnings(t);
  resolveActiveTheme({ themes: sortedThemes("aurora", "storefront") }, "deleted-theme");

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /deleted-theme/);
  assert.match(warnings[0] ?? "", /aurora/);
  assert.notEqual(warnings[0], undefined);
  // Must not be the step-2 message: the two states need different remedies (reactivate a theme vs.
  // reinstall the stock theme), so one shared string would be worse than no string.
  assert.doesNotMatch(warnings[0] ?? "", /falling back to the default theme/);
});

test("a site with zero themes warns rather than returning null silently", (t) => {
  const warnings = captureWarnings(t);
  assert.equal(resolveActiveTheme({ themes: [] }, "basic"), null);
  assert.equal(warnings.length, 1);
});
