import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedHref } from "@jini-ai/cms/navigation";

import { safeHref as platformSafeHref } from "../../../platform/html/safe-url.js";
import { safeHref as themeSafeHref } from "../render-contract.js";

/**
 * @file Characterization of Tovu's two `safeHref` helpers (`platform/html/safe-url.ts`, used by the
 * public renderers, and `features/theme/render-contract.ts`, used by the static tier) over the exact
 * inputs they accept and refuse, plus a pinned comparison with Jini's canonical `isAllowedHref`
 * (`@jini-ai/cms/navigation`). Written before size-design 03 item 03-a ("replace `safeHref` with
 * `isAllowedHref`"): that replacement is only behaviour-neutral if the composed
 * `isAllowedHref(...) ? href.trim() : "#"` agrees with `safeHref` on every input. It does not, on the
 * inputs in {@link JINI_DIVERGENCES}; the replacement is held until the owner rules on them.
 */
type SafeHref = (required: { value: string }) => string;

/** [input, output]: the output is the trimmed input when allowed, otherwise `"#"`. */
const SHARED: readonly (readonly [string, string])[] = [
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

/**
 * Inputs naming each copy's reserved `.invalid` placeholder origin (the fixed origin a `/…` href is
 * resolved against). Each copy's own placeholder host is treated as "same origin"; they differ from
 * one another only on the default-port spellings (`:443` vs `:80`).
 */
const PLATFORM_ONLY: readonly (readonly [string, string])[] = [
  ["//tovu-safehref.invalid/x", "//tovu-safehref.invalid/x"],
  ["/\\tovu-safehref.invalid/x", "/\\tovu-safehref.invalid/x"],
  ["//tovu-safehref.invalid:443/x", "//tovu-safehref.invalid:443/x"],
  ["//tovu-safehref.invalid:80/x", "#"],
];
const THEME_ONLY: readonly (readonly [string, string])[] = [
  ["//tovu-safehref.invalid/x", "//tovu-safehref.invalid/x"],
  ["/\\tovu-safehref.invalid/x", "/\\tovu-safehref.invalid/x"],
  ["//tovu-safehref.invalid:443/x", "#"],
  ["//tovu-safehref.invalid:80/x", "//tovu-safehref.invalid:80/x"],
];
const JINI_PLACEHOLDER_HOST_INPUTS = ["//safehref.invalid/x", "/\\safehref.invalid/x", "//safehref.invalid:80/x"];

function assertTable({ fn, rows }: { fn: SafeHref; rows: readonly (readonly [string, string])[] }): void {
  for (const [input, expected] of rows) assert.equal(fn({ value: input }), expected, JSON.stringify(input));
}

test("platform safeHref: exact output for every shared input", () => {
  assertTable({ fn: platformSafeHref, rows: SHARED });
  assertTable({ fn: platformSafeHref, rows: PLATFORM_ONLY });
});

test("theme safeHref: exact output for every shared input", () => {
  assertTable({ fn: themeSafeHref, rows: SHARED });
  assertTable({ fn: themeSafeHref, rows: THEME_ONLY });
});

test("both Tovu copies refuse Jini's own placeholder host spellings (and so differ from Jini)", () => {
  for (const input of JINI_PLACEHOLDER_HOST_INPUTS) {
    assert.equal(platformSafeHref({ value: input }), "#", input);
    assert.equal(themeSafeHref({ value: input }), "#", input);
  }
});

test("platform safeHref coerces every non-string to '#'", () => {
  for (const value of [undefined, null, 5, true, {}, []]) assert.equal(platformSafeHref({ value }), "#");
});

/** What `safeHref` would become if it were `isAllowedHref` plus the trim-and-fallback every caller needs. */
function composedFromJini({ value }: { value: string }): string {
  return isAllowedHref({ rawHref: value }) ? value.trim() : "#";
}

/** Every input on which the composed-from-Jini function disagrees with a Tovu copy. */
const JINI_DIVERGENCES: Readonly<Record<"platform" | "theme", readonly string[]>> = {
  platform: [
    "//tovu-safehref.invalid/x", "/\\tovu-safehref.invalid/x", "//tovu-safehref.invalid:443/x",
    ...JINI_PLACEHOLDER_HOST_INPUTS,
  ],
  theme: [
    "//tovu-safehref.invalid/x", "/\\tovu-safehref.invalid/x", "//tovu-safehref.invalid:80/x",
    ...JINI_PLACEHOLDER_HOST_INPUTS,
  ],
};

test("Jini isAllowedHref agrees with both Tovu copies on every shared input", () => {
  for (const [input] of SHARED) {
    assert.equal(composedFromJini({ value: input }), platformSafeHref({ value: input }), `platform ${JSON.stringify(input)}`);
    assert.equal(composedFromJini({ value: input }), themeSafeHref({ value: input }), `theme ${JSON.stringify(input)}`);
  }
});

test("Jini isAllowedHref differs from the Tovu copies on exactly the placeholder-host inputs, and throws on a non-string", () => {
  const all = [...SHARED.map(([input]) => input), ...PLATFORM_ONLY.map(([input]) => input), ...THEME_ONLY.map(([input]) => input), ...JINI_PLACEHOLDER_HOST_INPUTS];
  const unique = [...new Set(all)];
  const differing = (fn: SafeHref): string[] => unique.filter((input) => fn({ value: input }) !== composedFromJini({ value: input })).sort();
  assert.deepEqual(differing(platformSafeHref), [...new Set(JINI_DIVERGENCES.platform)].sort());
  assert.deepEqual(differing(themeSafeHref), [...new Set(JINI_DIVERGENCES.theme)].sort());
  assert.throws(() => isAllowedHref({ rawHref: undefined as unknown as string }), TypeError);
});
