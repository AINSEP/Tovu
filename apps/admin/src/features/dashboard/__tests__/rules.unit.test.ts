import { describe, expect, it } from "vitest";

import { commentsStatMeta, pagesStatMeta, postsStatMeta, shouldShowDefaultPasswordBanner, shouldShowSiteKeyBanner, siteKeyBannerCopy } from "../rules";

/**
 * @file Direct coverage for the stat-card meta formatters extracted out of `Dashboard`'s own body
 * (complexity-ceiling pass) — `mergeRecent`/`activityRowHref` already have their own header
 * comments and stay covered transitively through `Dashboard.unit.test.tsx`'s rendering tests, so
 * this file only adds the three new pure functions.
 *
 * Identity translator, same convention `pages/__tests__/rules.unit.test.ts` uses — asserts against
 * the English key template (with `{count}` substituted) rather than a real locale's copy. A
 * browser sweep (2026-09-22) found these three functions returning hardcoded English regardless of
 * locale; they now take a `Translate` the same way `pages/rules.ts`'s column-sort labels do.
 */
const identityT = (key: string): string => key;

describe("postsStatMeta", () => {
  it("is blank while published is still pending (null)", () => {
    expect(postsStatMeta(null, identityT)).toBe("");
  });

  it("reports the published count once known, including zero", () => {
    expect(postsStatMeta(0, identityT)).toBe("0 published");
    expect(postsStatMeta(5, identityT)).toBe("5 published");
  });
});

describe("pagesStatMeta", () => {
  it("is blank while drafts is still pending (null)", () => {
    expect(pagesStatMeta(null, identityT)).toBe("");
  });

  it("singularizes 'draft' for exactly one", () => {
    expect(pagesStatMeta(1, identityT)).toBe("1 draft");
  });

  it("pluralizes for zero and for more than one", () => {
    expect(pagesStatMeta(0, identityT)).toBe("0 drafts");
    expect(pagesStatMeta(3, identityT)).toBe("3 drafts");
  });
});

describe("commentsStatMeta", () => {
  it("reads 'nothing to review' only when the pending count is exactly 0", () => {
    expect(commentsStatMeta(0, identityT)).toBe("nothing to review");
  });

  it("reads 'awaiting moderation' for a positive pending count", () => {
    expect(commentsStatMeta(4, identityT)).toBe("awaiting moderation");
  });

  it("reads 'awaiting moderation' while still pending (null) — preserved, not fixed, by this extraction", () => {
    expect(commentsStatMeta(null, identityT)).toBe("awaiting moderation");
  });
});

describe("shouldShowDefaultPasswordBanner", () => {
  it("shows when the caller is on the default and hasn't dismissed", () => {
    expect(shouldShowDefaultPasswordBanner(true, false)).toBe(true);
  });

  it("hides once dismissed, even if still on the default", () => {
    expect(shouldShowDefaultPasswordBanner(true, true)).toBe(false);
  });

  it("hides when the caller is not on the default", () => {
    expect(shouldShowDefaultPasswordBanner(false, false)).toBe(false);
  });

  it("hides while the status is unknown (null) — fail closed, not open", () => {
    expect(shouldShowDefaultPasswordBanner(null, false)).toBe(false);
  });
});

describe("shouldShowSiteKeyBanner (site-key plan §A.6)", () => {
  it("shows for missing-with-data — a site key can't be found but this site has saved credentials", () => {
    expect(shouldShowSiteKeyBanner("missing-with-data")).toBe(true);
  });

  it("shows for mismatch — the active key's fingerprint disagrees with the site's stamped one", () => {
    expect(shouldShowSiteKeyBanner("mismatch")).toBe(true);
  });

  it("shows for invalid — a source was found but fails hex validation", () => {
    expect(shouldShowSiteKeyBanner("invalid")).toBe(true);
  });

  it("hides for active — the normal case", () => {
    expect(shouldShowSiteKeyBanner("active")).toBe(false);
  });

  it("hides for plain missing — a fresh site before its first key is minted at boot", () => {
    expect(shouldShowSiteKeyBanner("missing")).toBe(false);
  });

  it("hides while the state is unknown (undefined) — fail closed, same default shouldShowDefaultPasswordBanner uses", () => {
    expect(shouldShowSiteKeyBanner(undefined)).toBe(false);
  });
});

describe("siteKeyBannerCopy (site-key plan §A.6)", () => {
  it("has non-empty, distinct copy for each of the three bannered states", () => {
    const missingWithData = siteKeyBannerCopy("missing-with-data", identityT);
    const mismatch = siteKeyBannerCopy("mismatch", identityT);
    const invalid = siteKeyBannerCopy("invalid", identityT);
    expect(missingWithData.length).toBeGreaterThan(0);
    expect(mismatch.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(new Set([missingWithData, mismatch, invalid]).size).toBe(3);
  });

  it("returns empty string for a non-bannered state — Dashboard.tsx never renders it for these", () => {
    expect(siteKeyBannerCopy("active", identityT)).toBe("");
    expect(siteKeyBannerCopy("missing", identityT)).toBe("");
    expect(siteKeyBannerCopy(undefined, identityT)).toBe("");
  });
});
