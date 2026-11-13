import { describe, expect, it } from "vitest";

import { ApiError } from "../api";
import { COMMON_I18N } from "../i18n-common";
import { isVersionConflict, VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE } from "../version-conflict";

describe("isVersionConflict", () => {
  it("is true only for a 409 carrying the VERSION_CONFLICT code", () => {
    expect(isVersionConflict(new ApiError({ message: "stale", status: 409 }, { code: VERSION_CONFLICT_CODE }))).toBe(true);
  });

  it.each([
    ["a code-less 409 (slug already taken)", new ApiError({ message: "slug 'x' already exists", status: 409 })],
    ["a 409 with another code", new ApiError({ message: "bound", status: 409 }, { code: "MENU_LOCATION_BOUND" })],
    ["the code on a non-409", new ApiError({ message: "odd", status: 400 }, { code: VERSION_CONFLICT_CODE })],
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
