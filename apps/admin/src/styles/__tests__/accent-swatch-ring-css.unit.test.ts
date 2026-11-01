import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { effectiveDeclarationsFor } from "../../__tests__/unit/css-declarations.test-helper";

/**
 * @file Admin UI > Appearance, dark scheme (bug 11-01): the Charcoal accent swatch (#363636) barely
 * showed against the dark surface — Jini rings swatches with `--jini-border`, which in dark is
 * close to both. Dark swatches get the stronger border token instead (a ring, never a colour
 * change). jsdom resolves no cascade, so this reads the declared rule; the look was checked in Chrome.
 */
const settings = readFileSync(resolve(process.cwd(), "src/styles/settings.css"), "utf8");

it("dark: an unselected accent swatch is ringed with the strong border token", () => {
  const swatch = effectiveDeclarationsFor(settings, ':root[data-theme="dark"] .jini-accent-swatch:not(.active)');
  expect(swatch).toMatch(/box-shadow: inset 0 0 0 1px var\(--jini-border-strong\);/);
});
