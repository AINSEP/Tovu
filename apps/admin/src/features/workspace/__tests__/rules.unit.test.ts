import { describe, expect, it } from "vitest";

import { ApiError, type AdminWorkspace } from "../../../lib/api";
import { describeApiError, isWorkspaceDirty } from "../rules";

/**
 * @file Pure-logic coverage for `features/workspace/rules.ts` — the screen's `describeApiError`
 * override table and the rename form's dirty-state derivation. `features/workspace` had 0%
 * coverage and no test file at all before this pass.
 */

const WORKSPACE: AdminWorkspace = {
  id: "w1",
  name: "My Site",
  slug: "my-site",
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("describeApiError", () => {
  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["RESOURCE_CONFLICT", "That slug is already in use."],
  ])("overrides code %s with a fixed message", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 400, code), "fallback")).toBe(expected);
  });

  it("VALIDATION_ERROR prefers the server's own message, falling back when blank", () => {
    expect(describeApiError(new ApiError("slug must be lowercase", 400, "VALIDATION_ERROR"), "fallback")).toBe(
      "slug must be lowercase",
    );
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback")).toBe(
      "Please correct the highlighted fields.",
    );
  });

  it("an unrecognized code falls through to the shared default", () => {
    expect(describeApiError(new ApiError("raw message", 500, "SOMETHING_ELSE"), "fallback")).toBe("raw message");
  });

  it("a non-ApiError value falls through to the shared default", () => {
    expect(describeApiError(new Error("plain"), "fallback")).toBe("plain");
    expect(describeApiError("nope", "fallback")).toBe("fallback");
  });
});

describe("isWorkspaceDirty", () => {
  it("is false when the draft matches the persisted workspace exactly", () => {
    expect(isWorkspaceDirty(WORKSPACE, "My Site", "my-site")).toBe(false);
  });

  it("is true when the draft name differs", () => {
    expect(isWorkspaceDirty(WORKSPACE, "New Name", "my-site")).toBe(true);
  });

  it("is true when the draft slug differs", () => {
    expect(isWorkspaceDirty(WORKSPACE, "My Site", "new-slug")).toBe(true);
  });

  it("is true when both differ", () => {
    expect(isWorkspaceDirty(WORKSPACE, "New Name", "new-slug")).toBe(true);
  });
});
