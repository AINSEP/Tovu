import { describe, expect, it } from "vitest";

import { ApiError, type AdminTaxonomy, type AdminTaxonomyWithTerms, type AdminTerm } from "@/lib/api";
import { termDepth, otherMergeTargets, findSelectedTerm, describeDeleteBlocked, describeTrashError } from "../rules";

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

  it("returns null for an ApiError whose code isn't TERM_HAS_CHILDREN", () => {
    expect(describeDeleteBlocked(new ApiError("not found", 404, "TERM_NOT_FOUND", {}))).toBeNull();
  });

  it("returns null for an ApiError with no code at all", () => {
    expect(describeDeleteBlocked(new ApiError("server exploded", 500))).toBeNull();
  });

  // Owner ruling (T8b, 2026-09-21): content/term assignments no longer block a delete at all — a
  // term or taxonomy can be trashed while still assigned, hidden until restored. Only a term with
  // sub-terms still refuses, and a plain assignment code (now nothing sends it, but a defensive
  // check regardless) must fall through to null, not a stale blocked state.
  it("returns null for the retired TERM_HAS_ASSIGNMENTS code — assignments no longer block a delete", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_ASSIGNMENTS", { assignedCount: 3 });
    expect(describeDeleteBlocked(e)).toBeNull();
  });

  it("returns null for the retired TAXONOMY_HAS_ASSIGNMENTS code — taxonomies have no blocked case at all", () => {
    const e = new ApiError("blocked", 409, "TAXONOMY_HAS_ASSIGNMENTS", { assignedCount: 2 });
    expect(describeDeleteBlocked(e)).toBeNull();
  });

  it("TERM_HAS_CHILDREN: reads count and names the reparent-first remedy", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", { count: 4 });
    expect(describeDeleteBlocked(e)).toEqual({
      code: "TERM_HAS_CHILDREN",
      count: 4,
      message: "This term has 4 sub-terms. Move them under another parent or delete them first.",
    });
  });

  it("TERM_HAS_CHILDREN: singular count reads 'sub-term', not 'sub-terms'", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", { count: 1 });
    expect(describeDeleteBlocked(e)?.message).toBe(
      "This term has 1 sub-term. Move them under another parent or delete them first."
    );
  });

  it("defaults count to 0 (not a crash) when the 409 body omits its count field", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", {});
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });

  it("defaults count to 0 when the body is entirely absent", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN");
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });

  it("ignores a non-number count value rather than interpolating it raw", () => {
    const e = new ApiError("blocked", 409, "TERM_HAS_CHILDREN", { count: "many" });
    expect(describeDeleteBlocked(e)?.count).toBe(0);
  });
});

describe("describeTrashError", () => {
  it("returns no message and alreadyGone: false for no error at all", () => {
    expect(describeTrashError(null, "failed to delete")).toEqual({ alreadyGone: false, message: null });
  });

  it("404: alreadyGone true, no message — a quiet refetch, not a banner", () => {
    const e = new ApiError("not found", 404, "NOT_FOUND", {});
    expect(describeTrashError(e, "failed to delete")).toEqual({ alreadyGone: true, message: null });
  });

  it("409 TRASH_VERSION_CHANGED: names the reload-and-retry remedy, not the generic fallback", () => {
    const e = new ApiError("changed", 409, "TRASH_VERSION_CHANGED", {});
    expect(describeTrashError(e, "failed to delete")).toEqual({
      alreadyGone: false,
      message: "This item changed since you loaded it. Reload and try again.",
    });
  });

  it("falls back to describeApiError's generic message for anything else", () => {
    const e = new ApiError("server exploded", 500, undefined, {});
    expect(describeTrashError(e, "failed to delete")).toEqual({ alreadyGone: false, message: "server exploded" });
  });

  it("falls back to the given fallback text for a plain network Error", () => {
    expect(describeTrashError(new Error(""), "failed to delete")).toEqual({
      alreadyGone: false,
      message: "failed to delete",
    });
  });
});
