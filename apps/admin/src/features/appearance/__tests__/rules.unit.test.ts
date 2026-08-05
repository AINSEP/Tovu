import { describe, expect, it } from "vitest";

import type { PresentationSettings } from "../../../lib/api";
import { isActiveTheme } from "../rules";

/**
 * @file Pure-logic coverage for `features/appearance/rules.ts` — the active-theme status
 * derivation driving both a theme card's `.active` class and its Active-tag-vs-Activate-button
 * branch. `features/appearance` was 3.6% covered with no dedicated test file before this pass.
 */

const SETTINGS: PresentationSettings = {
  workspaceId: "w1",
  activeThemeId: "signal",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("isActiveTheme", () => {
  it("is true for the currently active theme", () => {
    expect(isActiveTheme(SETTINGS, "signal")).toBe(true);
  });

  it("is false for any other theme", () => {
    expect(isActiveTheme(SETTINGS, "column")).toBe(false);
    expect(isActiveTheme(SETTINGS, "tovu-official")).toBe(false);
  });
});
