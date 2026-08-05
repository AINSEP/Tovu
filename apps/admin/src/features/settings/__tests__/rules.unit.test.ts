import { describe, expect, it } from "vitest";

import { areAnySlicesLoading, describeSaveStatus, resolveDialogDataTheme, type SliceLoadState } from "../rules";
import type { SaveState } from "../../../hooks/use-settings-slice.hooks";
import { firstLoadError } from "../rules";

/**
 * @file Pure-logic coverage for `features/settings/rules.ts` — the "everything resolved" gate,
 * the first-error picker, the save-status label, and the dialog-theme mapping `SettingsUi.tsx`
 * derives from its six mounted slices. No React involved; see `SettingsUi.unit.test.tsx` for the
 * component-level tests (including the `InstructionsTab` fallback landmine).
 */

function slice(value: unknown, loadError: string | null = null): SliceLoadState {
  return { value, loadError };
}

describe("areAnySlicesLoading", () => {
  it("is false for an empty slice set", () => {
    expect(areAnySlicesLoading([])).toBe(false);
  });

  it("is false once every slice has settled (non-null value)", () => {
    expect(areAnySlicesLoading([slice("a"), slice({ theme: "dark" }), slice(0)])).toBe(false);
  });

  it("is true while any single slice is still null, regardless of position", () => {
    expect(areAnySlicesLoading([slice(null), slice("a")])).toBe(true);
    expect(areAnySlicesLoading([slice("a"), slice(null)])).toBe(true);
  });
});

describe("firstLoadError", () => {
  it("is null when no slice reports an error", () => {
    expect(firstLoadError([slice("a"), slice("b")])).toBeNull();
  });

  it("returns the first error in slice order, ignoring later ones", () => {
    const result = firstLoadError([slice("a"), slice(null, "first failure"), slice(null, "second failure")]);
    expect(result).toBe("first failure");
  });

  it("is null for an empty slice set", () => {
    expect(firstLoadError([])).toBeNull();
  });
});

describe("describeSaveStatus", () => {
  it.each<[SaveState, string]>([
    [{ status: "saving" }, "Saving…"],
    [{ status: "saved" }, "Saved"],
    [{ status: "error", message: "network down" }, "network down"],
    [{ status: "idle" }, ""],
  ])("renders %o as %j", (save, expected) => {
    expect(describeSaveStatus(save)).toBe(expected);
  });
});

describe("resolveDialogDataTheme", () => {
  it('maps "system" to undefined, so the CSS falls back to prefers-color-scheme', () => {
    expect(resolveDialogDataTheme("system")).toBeUndefined();
  });

  it("passes any concrete theme through unchanged", () => {
    expect(resolveDialogDataTheme("light")).toBe("light");
    expect(resolveDialogDataTheme("dark")).toBe("dark");
  });
});
