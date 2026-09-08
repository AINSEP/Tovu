import { describe, expect, it } from "vitest";

import {
  describeMediaHtmlAttributeError,
  isAllowedMediaHtmlAttributeName,
  parseMediaHtmlAttributes,
} from "../rules";

/**
 * @file `rules.ts`'s HTML-attributes allowlist — NOT currently wired to any form (see that file's
 * own header for why: the edit form briefly carried an `HTML attributes` field, which was removed
 * because `AdminMedia`/`MediaRecord` has nowhere to persist it, and a validated-but-non-persisting
 * field reads as working on Leona's live admin). Kept and tested anyway as the pure, reusable half
 * of the security control a follow-up agent's persistence pipe will need: media metadata is
 * authored here but rendered on the public site, so this is a stored-XSS boundary — an `on*`
 * handler, a `javascript:` value, or any name not on the allowlist must be rejected outright, with a
 * specific, visible reason naming the rejected attribute — never silently sanitized, never a generic
 * "invalid input".
 *
 * Adversarial cases below (mixed valid+invalid tokens, case variation, quote styles, boolean
 * attributes, malformed fragments) matter more than the happy path for a validator whose whole job
 * is refusing input — a validator that only ever sees well-formed, honest input has not been tested
 * at all.
 */

describe("isAllowedMediaHtmlAttributeName", () => {
  it("allows the data- prefix family regardless of suffix", () => {
    expect(isAllowedMediaHtmlAttributeName("data-motion")).toBe(true);
    expect(isAllowedMediaHtmlAttributeName("data-anything-at-all")).toBe(true);
  });

  it("allows the aria- prefix family regardless of suffix", () => {
    expect(isAllowedMediaHtmlAttributeName("aria-hidden")).toBe(true);
    expect(isAllowedMediaHtmlAttributeName("aria-label")).toBe(true);
  });

  it("allows every exact-match name on the fixed list", () => {
    for (const name of ["loading", "decoding", "playsinline", "muted", "loop", "autoplay", "poster"]) {
      expect(isAllowedMediaHtmlAttributeName(name)).toBe(true);
    }
  });

  it("is case-insensitive in both directions", () => {
    expect(isAllowedMediaHtmlAttributeName("DATA-FOO")).toBe(true);
    expect(isAllowedMediaHtmlAttributeName("ARIA-LABEL")).toBe(true);
    expect(isAllowedMediaHtmlAttributeName("LOADING")).toBe(true);
  });

  it("rejects a name that is not on the allowlist", () => {
    expect(isAllowedMediaHtmlAttributeName("style")).toBe(false);
    expect(isAllowedMediaHtmlAttributeName("href")).toBe(false);
    expect(isAllowedMediaHtmlAttributeName("srcdoc")).toBe(false);
    // Not a data-/aria- prefix, and not on the exact list — a prefix check that matched a
    // substring anywhere in the name (rather than anchored at the start) would wrongly admit this.
    expect(isAllowedMediaHtmlAttributeName("x-data-foo")).toBe(false);
  });

  it("rejects on* handlers even though this check runs independently of the event-handler check", () => {
    expect(isAllowedMediaHtmlAttributeName("onerror")).toBe(false);
    expect(isAllowedMediaHtmlAttributeName("onclick")).toBe(false);
  });
});

describe("parseMediaHtmlAttributes", () => {
  it("returns no attributes and no error for an empty (or whitespace-only) draft", () => {
    expect(parseMediaHtmlAttributes("")).toEqual({ attributes: {}, error: null });
    expect(parseMediaHtmlAttributes("   ")).toEqual({ attributes: {}, error: null });
  });

  it("parses one allowed quoted attribute", () => {
    expect(parseMediaHtmlAttributes('data-motion="fade-in"')).toEqual({
      attributes: { "data-motion": "fade-in" },
      error: null,
    });
  });

  it("parses multiple allowed attributes, including single-quoted and unquoted values", () => {
    const result = parseMediaHtmlAttributes(`data-motion="fade-in" aria-label='hello' loading=lazy`);
    expect(result).toEqual({
      attributes: { "data-motion": "fade-in", "aria-label": "hello", loading: "lazy" },
      error: null,
    });
  });

  it("parses a bare boolean attribute (no value) as present with an empty string value", () => {
    expect(parseMediaHtmlAttributes("muted")).toEqual({ attributes: { muted: "" }, error: null });
  });

  it("lowercases attribute names on the way in", () => {
    expect(parseMediaHtmlAttributes('DATA-Motion="Fade"')).toEqual({
      attributes: { "data-motion": "Fade" },
      error: null,
    });
  });

  it("rejects an on* handler with the specific event-handler reason, naming the attribute", () => {
    expect(parseMediaHtmlAttributes('onerror="alert(1)"')).toEqual({
      attributes: {},
      error: { reason: "event-handler", attribute: "onerror" },
    });
  });

  it("rejects on* case-insensitively", () => {
    expect(parseMediaHtmlAttributes('OnClick="doThing()"')).toEqual({
      attributes: {},
      error: { reason: "event-handler", attribute: "onclick" },
    });
  });

  it("rejects a javascript: value on an otherwise-allowed name", () => {
    // `poster` is a real, allowed <video> attribute — the value, not the name, is what's dangerous
    // here, so this must report `javascript-url`, not let the allowed name mask the bad value.
    expect(parseMediaHtmlAttributes('poster="javascript:alert(1)"')).toEqual({
      attributes: {},
      error: { reason: "javascript-url", attribute: "poster" },
    });
  });

  it("catches a javascript: value regardless of case or leading whitespace", () => {
    expect(parseMediaHtmlAttributes('poster="  JavaScript:alert(1)"')).toEqual({
      attributes: {},
      error: { reason: "javascript-url", attribute: "poster" },
    });
  });

  it("rejects a name that is not on the allowlist, naming it", () => {
    expect(parseMediaHtmlAttributes('style="color:red"')).toEqual({
      attributes: {},
      error: { reason: "disallowed-name", attribute: "style" },
    });
  });

  it("reports the FIRST rejection when several tokens would each fail, not a batch", () => {
    // `style` (disallowed) comes before `onerror` (event handler) in the input — the first offender
    // scanning left to right must win, proving this doesn't silently continue past a rejection.
    expect(parseMediaHtmlAttributes('style="color:red" onerror="alert(1)"')).toEqual({
      attributes: {},
      error: { reason: "disallowed-name", attribute: "style" },
    });
  });

  it("stops at the first bad token even when good tokens came before it", () => {
    // Adversarial: an operator (or an attacker relying on a reviewer skimming only the start of the
    // string) could front-load safe-looking attributes before a smuggled one. Every already-parsed
    // attribute must be discarded, not partially accepted.
    expect(parseMediaHtmlAttributes('data-motion="fade-in" loading="lazy" onerror="alert(1)"')).toEqual({
      attributes: {},
      error: { reason: "event-handler", attribute: "onerror" },
    });
  });

  it("reports a malformed fragment it cannot tokenize as a name/value pair", () => {
    const result = parseMediaHtmlAttributes('data-motion="fade-in" "stray-quote"');
    expect(result.attributes).toEqual({});
    expect(result.error?.reason).toBe("malformed");
  });
});

describe("describeMediaHtmlAttributeError", () => {
  it("names the rejected attribute in the event-handler message", () => {
    expect(describeMediaHtmlAttributeError({ reason: "event-handler", attribute: "onerror" }, "en")).toContain("onerror");
  });

  it("names the rejected attribute in the javascript-url message", () => {
    expect(describeMediaHtmlAttributeError({ reason: "javascript-url", attribute: "poster" }, "en")).toContain("poster");
  });

  it("names the rejected attribute in the disallowed-name message", () => {
    expect(describeMediaHtmlAttributeError({ reason: "disallowed-name", attribute: "style" }, "en")).toContain("style");
  });

  it("names the unparsable fragment in the malformed message", () => {
    expect(describeMediaHtmlAttributeError({ reason: "malformed", attribute: "stray-quote" }, "en")).toContain("stray-quote");
  });

  it("falls back to the English source string for a locale with no translation yet", () => {
    // Same `MEDIA_DICT[locale]?.[key] ?? key` fallback every other `t()` in this feature uses — a
    // brand-new field ships English-first, not blank, for a locale that hasn't been translated yet.
    expect(describeMediaHtmlAttributeError({ reason: "disallowed-name", attribute: "style" }, "xx-not-a-real-locale")).toContain(
      "style"
    );
  });
});

// ---------------------------------------------------------------------------
// Attribute-NAME shape (2026-09-07 stored-XSS fix). Mirrors the identical cases added to
// `@jini-ai/cms/media`'s `html-attributes.test.ts` — the two copies must agree, or this form shows
// an operator a hint the server disagrees with.
// ---------------------------------------------------------------------------

it("isAllowedMediaHtmlAttributeName: rejects a data-/aria- name carrying tag-breaking characters", () => {
  for (const name of ["data-x><svg/onload", "data-a/onerror", "aria-x<img", "data-x`y", "data-x>", "aria-]"]) {
    expect(isAllowedMediaHtmlAttributeName(name), `${name} must not be allowed`).toBe(false);
  }
});

it("isAllowedMediaHtmlAttributeName: still accepts every well-formed name the field exists for", () => {
  for (const name of ["data-motion", "aria-label", "DATA-FOO", "loading", "decoding", "poster", "data-x-1"]) {
    expect(isAllowedMediaHtmlAttributeName(name), `${name} must stay allowed`).toBe(true);
  }
});

it("parseMediaHtmlAttributes: an attribute name that would close the tag is rejected, not parsed into the map", () => {
  const result = parseMediaHtmlAttributes("data-x><svg/onload=alert(1)");
  expect(result.attributes).toEqual({});
  expect(result.error).toEqual({ reason: "disallowed-name", attribute: "data-x><svg/onload" });
});
