import { describe, expect, it } from "vitest";

import { ApiError } from "../api";
import { COMMON_I18N } from "../i18n-common";
import { isVersionConflict, VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE } from "../version-conflict";

describe("isVersionConflict", () => {
  it("is true only for a 409 carrying the VERSION_CONFLICT code", () => {
    expect(isVersionConflict(new ApiError("stale", 409, VERSION_CONFLICT_CODE))).toBe(true);
  });

  it.each([
    ["a code-less 409 (slug already taken)", new ApiError("slug 'x' already exists", 409)],
    ["a 409 with another code", new ApiError("bound", 409, "MENU_LOCATION_BOUND")],
    ["the code on a non-409", new ApiError("odd", 400, VERSION_CONFLICT_CODE)],
    ["a plain Error", new Error("stale")],
    ["a non-error value", "stale"],
  ])("is false for %s", (_label, error) => {
    expect(isVersionConflict(error)).toBe(false);
  });
});

describe("VERSION_CONFLICT_MESSAGE", () => {
  it("is translated in every COMMON_I18N locale", () => {
    for (const [locale, dict] of Object.entries(COMMON_I18N)) {
      expect(dict[VERSION_CONFLICT_MESSAGE], locale).toBeTruthy();
      expect(dict[VERSION_CONFLICT_MESSAGE], locale).not.toBe(VERSION_CONFLICT_MESSAGE);
    }
  });
});
