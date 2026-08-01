import { describe, expect, it } from "vitest";

import { hasPermission } from "../permissions";

/**
 * @file `hasPermission()` — pins the wildcard-affordance bug fix (owner's `["*"]` grant was
 * being checked with a literal `.includes()` in `Settings.tsx`/`Comments.tsx`, so the wildcard
 * never matched any real permission name and the workspace owner lost every gated affordance).
 */

describe("hasPermission", () => {
  it("grants access to an owner holding the unconstrained wildcard, for any permission asked", () => {
    expect(hasPermission(["*"], "comments.read")).toBe(true);
    expect(hasPermission(["*"], "settings.global.write")).toBe(true);
    expect(hasPermission(["*"], "anything.at.all")).toBe(true);
  });

  it("grants access for exactly the permission a specific grant names, and no other", () => {
    expect(hasPermission(["comments.read"], "comments.read")).toBe(true);
    expect(hasPermission(["comments.read"], "comments.configure")).toBe(false);
  });

  it("denies a principal holding neither the wildcard nor the requested permission", () => {
    expect(hasPermission([], "comments.read")).toBe(false);
    expect(hasPermission(["comments.moderate"], "comments.read")).toBe(false);
  });

  it("pins the near-miss: a concrete grant must never satisfy a request for the literal wildcard string", () => {
    // The regression this guards against is a helper that checks "*" on the wrong side of the
    // comparison -- e.g. treating `permission === "*"` as "any permission works" instead of "the
    // caller holds an actual wildcard grant". `hasPermission(["posts.read"], "*")` would pass
    // every case above even with that inversion, so it needs its own assertion: holding
    // `posts.read` (a real, specific grant) must not be read as holding `"*"` itself.
    expect(hasPermission(["posts.read"], "*")).toBe(false);
    // Same shape with no grants at all.
    expect(hasPermission([], "*")).toBe(false);
  });
});
