import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminMember } from "@/lib/api";
import { describeApiError, emptyRowState, memberRowMenuItems } from "../rules";
import { t } from "../members-i18n";

/**
 * @file Pure-logic coverage for `features/members/rules.ts`'s `describeApiError` override — new
 * for C4 (plan-access.md §4). The screen's row-menu builder and `emptyRowState` already had no
 * dedicated test file; this covers `describeApiError`'s FORBIDDEN override in both English and a
 * translated locale, matching `users/__tests__/rules.unit.test.ts` and `roles/__tests__/
 * rules.unit.test.ts`'s identical shape for the same bug class.
 */

const ACTIVE_MEMBER: AdminMember = {
  id: "m1",
  workspaceId: "w1",
  email: "alice@example.com",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

describe("describeApiError", () => {
  it("overrides FORBIDDEN with a fixed message", () => {
    expect(describeApiError(new ApiError("raw", 403, "FORBIDDEN"), "fallback", "en")).toBe(
      "You do not have permission to do that.",
    );
  });

  it("an unrecognized code falls through to the shared default", () => {
    expect(describeApiError(new ApiError("raw message", 500, "SOMETHING_ELSE"), "fallback", "en")).toBe(
      "raw message",
    );
  });

  it("a non-ApiError value falls through to the shared default", () => {
    expect(describeApiError(new Error("plain"), "fallback", "en")).toBe("plain");
    expect(describeApiError("nope", "fallback", "en")).toBe("fallback");
  });

  // C4 — the FORBIDDEN override leaked English regardless of locale.
  it("translates the FORBIDDEN override into the operator's locale (es)", () => {
    expect(describeApiError(new ApiError("raw", 403, "FORBIDDEN"), "fallback", "es")).toBe(
      "No tienes permiso para hacer eso.",
    );
  });

  it("falls back to English for an unrecognized locale", () => {
    expect(describeApiError(new ApiError("raw", 403, "FORBIDDEN"), "fallback", "xx")).toBe(
      "You do not have permission to do that.",
    );
  });
});

// C4 — dictionary-parity spot check for the 1 key this pass added.
describe("members-i18n — C4 key", () => {
  const LOCALES = [
    "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
    "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
  ];

  for (const locale of LOCALES) {
    it(`t(${locale}, "You do not have permission to do that.") is non-empty and translated`, () => {
      const translated = t(locale, "You do not have permission to do that.");
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("You do not have permission to do that.");
    });
  }
});

describe("emptyRowState", () => {
  it("starts with everything false/null", () => {
    expect(emptyRowState()).toEqual({ disabling: false, resending: false, error: null, notice: null });
  });
});

describe("memberRowMenuItems", () => {
  const handlers = { onResendSignInLink: vi.fn(), onRequestDisable: vi.fn() };

  it("an active member gets both Resend and Disable", () => {
    const items = memberRowMenuItems(ACTIVE_MEMBER, emptyRowState(), handlers, "en");
    expect(items.map((i) => i.key)).toEqual(["resend", "disable"]);
  });

  it("a disabled member gets only Resend", () => {
    const items = memberRowMenuItems({ ...ACTIVE_MEMBER, status: "disabled" }, emptyRowState(), handlers, "en");
    expect(items.map((i) => i.key)).toEqual(["resend"]);
  });
});
