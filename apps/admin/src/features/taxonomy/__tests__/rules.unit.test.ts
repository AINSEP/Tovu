import { describe, expect, it } from "vitest";

import { ApiError, type AdminTaxonomy, type AdminTaxonomyWithTerms, type AdminTerm } from "@/lib/api";
import { termDepth, otherMergeTargets, findSelectedTerm, describeDeleteBlocked } from "../rules";

/**
 * @file Pure logic for `features/taxonomy/rules.ts`.
 *
 * `termDepth` carries the only defensive branch in this module (the 32-deep cycle bound) — it is
 * asserted directly with an artificial parent cycle, not just at realistic depths, since a
 * server-side guarantee this comment explicitly says it "never trusts blindly" is exactly the kind
 * of assumption a real bug would violate.
 */

function term(overrides: Partial<AdminTerm> = {}): AdminTerm {
  return {
    id: "t1",
    taxonomyId: "tax1",
    parentId: null,
    name: "Term",
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("termDepth", () => {
  it("is 0 for a term with no parent", () => {
    const t = term({ id: "a", parentId: null });
    expect(termDepth({ term: t, byId: new Map([["a", t]]) })).toBe(0);
  });

  it("is 1 for a term one level under a top-level parent", () => {
    const parent = term({ id: "a", parentId: null });
    const child = term({ id: "b", parentId: "a" });
    const byId = new Map([["a", parent], ["b", child]]);
    expect(termDepth({ term: child, byId })).toBe(1);
  });

  it("walks a multi-level chain to the correct depth", () => {
    const a = term({ id: "a", parentId: null });
    const b = term({ id: "b", parentId: "a" });
    const c = term({ id: "c", parentId: "b" });
    const d = term({ id: "d", parentId: "c" });
    const byId = new Map([["a", a], ["b", b], ["c", c], ["d", d]]);
    expect(termDepth({ term: d, byId })).toBe(3);
  });

  it("stops at a dangling parentId not present in byId, without throwing", () => {
    const orphan = term({ id: "x", parentId: "missing-parent" });
    expect(termDepth({ term: orphan, byId: new Map([["x", orphan]]) })).toBe(1);
  });

  it("terminates instead of looping forever on a parentId cycle", () => {
    const a = term({ id: "a", parentId: "b" });
    const b = term({ id: "b", parentId: "a" });
    const byId = new Map([["a", a], ["b", b]]);
    // A 2-node cycle would spin forever without the visited-set guard; it must return a finite
    // number, and the guard trips on revisiting "a" or "b" long before the 32-deep bound would.
    expect(termDepth({ term: a, byId })).toBeLessThan(32);
    expect(Number.isFinite(termDepth({ term: a, byId }))).toBe(true);
  });
});

function taxonomyMeta(overrides: Partial<AdminTaxonomy> = {}): AdminTaxonomy {
  return {
    id: "tax1",
    name: "Category",
    hierarchical: false,
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("otherMergeTargets", () => {
  const t1 = term({ id: "t1", name: "One" });
  const t2 = term({ id: "t2", name: "Two" });
  const t3 = term({ id: "t3", name: "Three" });
  const taxonomy: AdminTaxonomyWithTerms = {
    taxonomy: taxonomyMeta(),
    terms: [t1, t2, t3],
  };

  it("excludes exactly the given term id, keeping the rest in order", () => {
    expect(otherMergeTargets(taxonomy, "t2")).toEqual([t1, t3]);
  });

  it("returns every term unchanged when the excluded id matches none", () => {
    expect(otherMergeTargets(taxonomy, "does-not-exist")).toEqual([t1, t2, t3]);
  });

  it("returns an empty array for a taxonomy with a single term once that term is excluded", () => {
    const single: AdminTaxonomyWithTerms = { ...taxonomy, terms: [t1] };
    expect(otherMergeTargets(single, "t1")).toEqual([]);
  });

  it("returns an empty array for a taxonomy with no terms at all", () => {
    const empty: AdminTaxonomyWithTerms = { ...taxonomy, terms: [] };
    expect(otherMergeTargets(empty, "anything")).toEqual([]);
  });
});

describe("findSelectedTerm", () => {
  const t1 = term({ id: "t1", name: "One" });
  const t2 = term({ id: "t2", name: "Two" });
  const group1: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "g1", name: "Category" }), terms: [t1] };
  const group2: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "g2", name: "Tag" }), terms: [t2] };

  it("returns null when taxonomies is null", () => {
    expect(findSelectedTerm(null, "t1")).toBeNull();
  });

  it("returns null when selectedTermId is null", () => {
    expect(findSelectedTerm([group1, group2], null)).toBeNull();
  });

  it("finds a term in the first group", () => {
    expect(findSelectedTerm([group1, group2], "t1")).toEqual({ taxonomy: group1, term: t1 });
  });

  it("finds a term in a later group after scanning past the first", () => {
    expect(findSelectedTerm([group1, group2], "t2")).toEqual({ taxonomy: group2, term: t2 });
  });

  it("returns null when no group contains a matching term", () => {
    expect(findSelectedTerm([group1, group2], "does-not-exist")).toBeNull();
  });

  it("returns null for an empty taxonomies array", () => {
    expect(findSelectedTerm([], "t1")).toBeNull();
  });
});

describe("describeDeleteBlocked", () => {
  it("returns null for a plain Error (network failure, etc.) — not an ApiError at all", () => {
    expect(describeDeleteBlocked(new Error("network down"))).toBeNull();
  });

  it("returns null for a non-Error thrown value", () => {
    expect(describeDeleteBlocked("boom")).toBeNull();
  });

  it("returns null for an ApiError whose code isn't one of the three known blocked-delete codes", () => {
    expect(describeDeleteBlocked(new ApiError("not found", 404, "TERM_NOT_FOUND", {}))).toBeNull();
  });

  it("returns null for an ApiError with no code at all", () => {
    expect(describeDeleteBlocked(new ApiError("server exploded", 500))).toBeNull();
  });

  it("TERM_HAS_ASSIGNMENTS: reads assignedCount and pluralizes for count > 1", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS", { assignedCount: 3 });
    expect(describeDeleteBlocked(e)).toEqual({
      code: "TERM_HAS_ASSIGNMENTS",
      count: 3,
      message: "Still assigned to 3 content items. Unassign it, or merge it into another term, before deleting.",
    });
  });

  it("TERM_HAS_ASSIGNMENTS: singular count reads 'item', not 'items'", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS", { assignedCount: 1 });
    expect(describeDeleteBlocked(e)?.message).toBe(
      "Still assigned to 1 content item. Unassign it, or merge it into another term, before deleting."
    );
  });

  it("TAXONOMY_HAS_ASSIGNMENTS: reads assignedCount and names the taxonomy-level remedy", () => {
    const e = new ApiError("blocked", 409, "TAXONOMY_HAS_ASSIGNMENTS", { assignedCount: 2 });
    expect(describeDeleteBlocked(e)).toEqual({
      code: "TAXONOMY_HAS_ASSIGNMENTS",
      count: 2,
      message:
        "A term in this taxonomy is still assigned to 2 content items. Unassign or merge that term before deleting the taxonomy.",
    });
  });

  it("TAXONOMY_HAS_ASSIGNMENTS: singular count reads 'item', not 'items'", () => {
    const e = new ApiError("blocked", 409, "TAXONOMY_HAS_ASSIGNMENTS", { assignedCount: 1 });
    expect(describeDeleteBlocked(e)?.message).toBe(
      "A term in this taxonomy is still assigned to 1 content item. Unassign or merge that term before deleting the taxonomy."
    );
  });

  it("TERM_HAS_CHILDREN: reads childCount and names the reparent-first remedy", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", { childCount: 4 });
    expect(describeDeleteBlocked(e)).toEqual({
      code: "TERM_HAS_CHILDREN",
      count: 4,
      message: "Has 4 child terms under it. Delete or move them first.",
    });
  });

  it("TERM_HAS_CHILDREN: singular count reads 'term', not 'terms'", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", { childCount: 1 });
    expect(describeDeleteBlocked(e)?.message).toBe("Has 1 child term under it. Delete or move them first.");
  });

  it("defaults count to 0 (not a crash) when the 409 body omits its count field", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS", {});
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });

  it("defaults count to 0 when the body is entirely absent", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS");
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });

  it("ignores a non-number count value rather than interpolating it raw", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS", { assignedCount: "many" });
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });
});
