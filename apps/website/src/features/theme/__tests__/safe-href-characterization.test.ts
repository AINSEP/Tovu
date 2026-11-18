import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedHref, toAllowedHref } from "@jini-ai/cms/navigation";

/**
 * @file Characterization of the single href standard Tovu's renderers use: `isAllowedHref` decides,
 * `toAllowedHref` coerces (`@jini-ai/cms/navigation`, Jini). Written when Tovu's two hand-kept
 * `safeHref` helpers (`platform/html/safe-url.ts`, `features/theme/render-contract.ts`) were pinned
 * against it; the owner ruled Jini's function the one standard (2026-11-17) and both helpers were deleted
 * with every caller repointed. The rows below are the exact inputs those helpers were characterized
 * over, with the one standard's answer. The call sites are covered by the renderer suites
 * (`render.test.ts`, `menu-tree-render.test.ts`, `entry-list-render.test.ts`).
 *
 * Differences from the retired helpers, all intended: a protocol-relative href to the old helpers'
 * own placeholder host (`//tovu-safehref.invalid/x`, `/\tovu-safehref.invalid/x`, either default-port
 * spelling) is now refused like every other protocol-relative href (the two helpers also disagreed with
 * each other on `:80` / `:443`); one to Jini's former placeholder host (`//safehref.invalid/x` ...) is
 * refused where Jini used to accept it; a non-string yields `"#"` instead of throwing.
 */

/** [input, output of `toAllowedHref`]: the trimmed input when allowed, otherwise `"#"`. */
const TABLE: readonly (readonly [string, string])[] = [
  ["", "#"], [" ", "#"], ["#", "#"], ["#x", "#x"], [" #x ", "#x"], [" #x", "#x"], ["#\u0000", "#\u0000"],
  ["/", "/"], ["/a", "/a"], ["/a?b#c", "/a?b#c"], [" /a ", "/a"], ["/%2f/evil", "/%2f/evil"], ["/a b", "/a b"], ["/\u0000a", "/\u0000a"],
  ["http://a", "http://a"], ["HTTPS://a", "HTTPS://a"], [" https://a ", "https://a"],
  ["mailto:a@b", "mailto:a@b"], ["MAILTO:a", "MAILTO:a"], ["mailto:", "mailto:"],
  ["//evil.example", "#"], ["/\\evil.example", "#"], ["/\t/evil.example", "#"], ["/\n/evil.example", "#"], ["/\r/evil.example", "#"],
  ["///evil", "#"], ["/\\/evil", "#"], ["/\\\\evil", "#"], ["\\\\evil", "#"],
  ["javascript:alert(1)", "#"], ["java\tscript:alert(1)", "#"], [" javascript:x", "#"], ["data:text/html,x", "#"],
  ["file:///etc/passwd", "#"], ["blob:x", "#"], ["about:blank", "#"], ["tel:1", "#"], ["ftp://x", "#"],
  ["http:evil", "#"], ["https:", "#"], ["x", "#"], ["a/b", "#"], ["./a", "#"], ["../a", "#"], ["?q", "#"], ["\u0000/a", "#"],
];

/** Rows 1-4 of the retired helpers' difference table plus Jini's former placeholder host: all refused. */
const PLACEHOLDER_HOST_ROWS: readonly (readonly [string, string])[] = [
  ["//tovu-safehref.invalid/x", "#"],
  ["/\\tovu-safehref.invalid/x", "#"],
  ["//tovu-safehref.invalid:443/x", "#"],
  ["//tovu-safehref.invalid:80/x", "#"],
  ["//safehref.invalid/x", "#"],
  ["/\\safehref.invalid/x", "#"],
  ["//safehref.invalid:80/x", "#"],
];

const ALL_ROWS = [...TABLE, ...PLACEHOLDER_HOST_ROWS];

function isExpectedAllowed({ input, output }: { input: string; output: string }): boolean {
  return output !== "#" || input.trim().startsWith("#");
}

test("toAllowedHref: exact output for every characterized input, placeholder hosts included", () => {
  for (const [input, output] of ALL_ROWS) assert.equal(toAllowedHref({ rawHref: input }), output, JSON.stringify(input));
});

test("isAllowedHref: exact decision for every characterized input", () => {
  for (const [input, output] of ALL_ROWS) {
    assert.equal(isAllowedHref({ rawHref: input }), isExpectedAllowed({ input, output }), JSON.stringify(input));
  }
});

test("the characterized table keeps its 46 shared inputs and 7 placeholder-host rows", () => {
  assert.equal(new Set(TABLE.map(([input]) => input)).size, 46);
  assert.equal(new Set(ALL_ROWS.map(([input]) => input)).size, 53);
});

test("raw widget-prop JSON (a non-string) coerces to '#' and is never allowed", () => {
  for (const rawHref of [undefined, null, 5, true, {}, []]) {
    assert.equal(toAllowedHref({ rawHref }), "#");
    assert.equal(isAllowedHref({ rawHref }), false);
  }
});
