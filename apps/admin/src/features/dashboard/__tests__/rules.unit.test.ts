import { describe, expect, it } from "vitest";

import { commentsStatMeta, pagesStatMeta, postsStatMeta, shouldShowDefaultPasswordBanner } from "../rules";

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
