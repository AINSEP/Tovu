import { describe, expect, it } from "vitest";

import { commentsStatMeta, pagesStatMeta, postsStatMeta } from "../rules";

/**
 * @file Direct coverage for the stat-card meta formatters extracted out of `Dashboard`'s own body
 * (complexity-ceiling pass) — `mergeRecent`/`activityRowHref` already have their own header
 * comments and stay covered transitively through `Dashboard.unit.test.tsx`'s rendering tests, so
 * this file only adds the three new pure functions.
 */

describe("postsStatMeta", () => {
  it("is blank while published is still pending (null)", () => {
    expect(postsStatMeta(null)).toBe("");
  });

  it("reports the published count once known, including zero", () => {
    expect(postsStatMeta(0)).toBe("0 published");
    expect(postsStatMeta(5)).toBe("5 published");
  });
});

describe("pagesStatMeta", () => {
  it("is blank while drafts is still pending (null)", () => {
    expect(pagesStatMeta(null)).toBe("");
  });

  it("singularizes 'draft' for exactly one", () => {
    expect(pagesStatMeta(1)).toBe("1 draft");
  });

  it("pluralizes for zero and for more than one", () => {
    expect(pagesStatMeta(0)).toBe("0 drafts");
    expect(pagesStatMeta(3)).toBe("3 drafts");
  });
});

describe("commentsStatMeta", () => {
  it("reads 'nothing to review' only when the pending count is exactly 0", () => {
    expect(commentsStatMeta(0)).toBe("nothing to review");
  });

  it("reads 'awaiting moderation' for a positive pending count", () => {
    expect(commentsStatMeta(4)).toBe("awaiting moderation");
  });

  it("reads 'awaiting moderation' while still pending (null) — preserved, not fixed, by this extraction", () => {
    expect(commentsStatMeta(null)).toBe("awaiting moderation");
  });
});
