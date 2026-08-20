import assert from "node:assert/strict";
import test from "node:test";

import { resolveDefaultTimeoutMs as resolveHandlebars } from "../handlebars-sandbox.js";
import { resolveDefaultTimeoutMs as resolveLiquid } from "../liquid-sandbox.js";
import { resolveDefaultTimeoutMs } from "../worker-sandbox.js";

/**
 * @file Regression cover for `TOVU_THEME_RENDER_TIMEOUT_MS` parsing, plus the invariant that keeps
 * it a regression cover at all.
 *
 * Until 2026-08-20, `liquid-sandbox.ts` and `handlebars-sandbox.ts` each carried their OWN copy of
 * `resolveDefaultTimeoutMs` — identical logic, but two independently-editable functions. That is
 * exactly what let their doc comments drift: one copy's incident writeup ended up citing the OTHER
 * engine's test file (`render-handlebars.test.ts`, inside the Liquid file) — see the 2026-08-20
 * worker-sandbox extraction report in `ADS-memory/reports/architecture/`. After the extraction there
 * is exactly one implementation, in `worker-sandbox.ts`; `liquid-sandbox.ts`/`handlebars-sandbox.ts`
 * each `export { resolveDefaultTimeoutMs } from "./worker-sandbox.js"` rather than redefine it.
 *
 * The identity assertion below is the regression guard for THAT: if either sandbox is ever given its
 * own private `resolveDefaultTimeoutMs` again — even a byte-identical copy-paste — `resolveLiquid`/
 * `resolveHandlebars` stop being the same function object as the shared export, and this test fails
 * before the two copies get any chance to drift apart the way they did before.
 *
 * The parsing behavior itself is asserted once below, against the canonical export (proven identical
 * to what each wrapper re-exports by the assertion above, so testing it three times would add no
 * coverage). Unchanged from the pre-extraction version: the first version of this override used
 * `Number.parseInt`, which stops at the first non-digit and silently accepts a malformed PREFIX. An
 * adversarial audit on 2026-08-19 found the consequences: `"5e3"` parsed to **5** — a five-MILLISECOND
 * render budget, so every page render on the site would fail — and `"1e10"` parsed to 1. `"60000ms"`
 * parsed to 60000, quietly bypassing the fallback the code's own comment claimed to provide. There
 * was also no upper bound, so `"999999999"` (~11.5 days) was accepted, defeating the runaway-template
 * guard this budget exists to enforce. These tests exist so a future "simplification" back to
 * `parseInt`, or a widened bound, fails loudly.
 */

test("both sandbox wrappers resolve TOVU_THEME_RENDER_TIMEOUT_MS through the SAME shared implementation, not a private copy", () => {
  assert.equal(
    resolveLiquid,
    resolveDefaultTimeoutMs,
    "liquid-sandbox.ts's resolveDefaultTimeoutMs must be a re-export of worker-sandbox.ts's, not its own copy"
  );
  assert.equal(
    resolveHandlebars,
    resolveDefaultTimeoutMs,
    "handlebars-sandbox.ts's resolveDefaultTimeoutMs must be a re-export of worker-sandbox.ts's, not its own copy"
  );
});

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

test("TOVU_THEME_RENDER_TIMEOUT_MS is parsed strictly, never by parseInt's prefix rule", (t) => {
  const original = process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
  t.after(() => {
    if (original === undefined) delete process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
    else process.env.TOVU_THEME_RENDER_TIMEOUT_MS = original;
  });

  for (const [raw, expected, why] of CASES) {
    if (raw === undefined) delete process.env.TOVU_THEME_RENDER_TIMEOUT_MS;
    else process.env.TOVU_THEME_RENDER_TIMEOUT_MS = raw;
    assert.equal(resolveDefaultTimeoutMs(), expected, `${JSON.stringify(raw)} -> ${expected}: ${why}`);
  }
});
