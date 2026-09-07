import { describe, expect, it } from "vitest";
import { MEDIA_DICT } from "../media-i18n";

/**
 * @file `MEDIA_DICT` cross-locale coverage — the exact gap a live audit caught 2026-09-07: `Media.tsx`
 * gained a new copy string ("Uploaded videos appear here once you add them.") when the Videos tab's
 * empty state was fixed to no longer claim video wasn't supported, but the string was added to
 * `Media.tsx` only — none of the 21 locale blocks in `media-i18n.ts` got a translation for it. Per
 * this file's own header, `rules.ts`'s `t` is `MEDIA_DICT[locale]?.[key] ?? key`: a missing entry
 * doesn't error, it silently renders the raw English string to a non-English locale. That silence is
 * exactly why this needs a standing test, not a one-time fix — mirrors
 * `lib/__tests__/i18n-common.unit.test.ts`'s cross-locale parity idiom (same two assertions: identical
 * key sets, no empty values), applied to this feature's own dictionary instead of the shared one.
 *
 * Per that file's own comment, new keys/locales are NOT asserted individually here — this test keeps
 * verifying structure so it stays correct as `MEDIA_DICT` grows, rather than becoming a second place
 * (besides `Media.tsx` itself) that must be remembered for every future copy string.
 */
describe("MEDIA_DICT: cross-locale key parity", () => {
  const locales = Object.keys(MEDIA_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(MEDIA_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(MEDIA_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(MEDIA_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  // The specific regression: key-set parity alone would NOT have caught this bug (the key was
  // missing from every locale equally, so all 21 blocks agreed with each other) — only checking that
  // every key `Media.tsx` actually calls `t(...)` with is present catches "added to source, added to
  // zero locales."
  it("covers every copy string Media.tsx's MediaTypeEmptyState/Media screen call t() with (spot check: the video empty-state copy this audit found missing)", () => {
    for (const locale of locales) {
      expect(MEDIA_DICT[locale]["Uploaded videos appear here once you add them."], `locale ${locale}`).toBeTruthy();
    }
  });
});
