import assert from "node:assert/strict";
import test from "node:test";

import { resolveDefaultTimeoutMs as resolveHandlebars } from "../handlebars-sandbox.js";
import { resolveDefaultTimeoutMs as resolveLiquid } from "../liquid-sandbox.js";

/**
 * @file Regression cover for `TOVU_THEME_RENDER_TIMEOUT_MS` parsing.
 *
 * The first version of this override used `Number.parseInt`, which stops at the first non-digit and
 * silently accepts a malformed PREFIX. An adversarial audit on 2026-08-19 found the consequences:
 * `"5e3"` parsed to **5** — a five-MILLISECOND render budget, so every page render on the site would
 * fail — and `"1e10"` parsed to 1. `"60000ms"` parsed to 60000, quietly bypassing the fallback the
 * code's own comment claimed to provide. There was also no upper bound, so `"999999999"` (~11.5 days)
 * was accepted, defeating the runaway-template guard this budget exists to enforce.
 *
 * These tests exist so a future "simplification" back to `parseInt` fails loudly. Both sandboxes carry
 * an independent copy of the resolver, so both are asserted — a fix applied to only one would pass a
 * single-engine test.
 */

const CASES: ReadonlyArray<readonly [string | undefined, number, string]> = [
  [undefined, 5000, "unset falls back to the product default"],
  ["", 5000, "empty string falls back rather than parsing to NaN"],
  ["60000", 60000, "a plain integer is honored"],
  ["  60000  ", 60000, "surrounding whitespace is tolerated"],
  ["5e3", 5000, "REGRESSION: parseInt gave 5ms here — every render would fail"],
  ["1e10", 5000, "REGRESSION: parseInt gave 1ms here"],
  ["60000ms", 5000, "REGRESSION: parseInt accepted the malformed prefix and returned 60000"],
  ["abc", 5000, "non-numeric falls back"],
  ["0", 5000, "zero would terminate every render instantly"],
  ["-1", 5000, "negative falls back"],
  ["999999999", 5000, "above the 5-minute ceiling falls back — an absurd budget defeats the guard"],
  ["300000", 300000, "exactly the ceiling is still accepted"],
  ["300001", 5000, "one past the ceiling falls back"],
];

for (const [engine, resolve] of [["handlebars", resolveHandlebars], ["liquid", resolveLiquid]] as const) {
  test(`${engine} sandbox: TOVU_THEME_RENDER_TIMEOUT_MS is parsed strictly, never by parseInt's prefix rule`, (t) => {
    const original = process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
    t.after(() => {
      if (original === undefined) delete process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
      else process.env.TOVU_THEME_RENDER_TIMEOUT_MS = original;
    });

    for (const [raw, expected, why] of CASES) {
      if (raw === undefined) delete process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
      else process.env.TOVU_THEME_RENDER_TIMEOUT_MS = raw;
      assert.equal(resolve(), expected, `${JSON.stringify(raw)} -> ${expected}: ${why}`);
    }
  });
}
