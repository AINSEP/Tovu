import { describe, expect, it } from "vitest";

import { ApiError, type AdminWorkspace } from "@/lib/api";
import { describeApiError, isWorkspaceDirty } from "../rules";
import { t } from "../workspace-i18n";

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
    expect(describeApiError(new ApiError("raw", 400, code), "fallback", "en")).toBe(expected);
  });

  it("VALIDATION_ERROR prefers the server's own message, falling back when blank", () => {
    expect(
      describeApiError(new ApiError("slug must be lowercase", 400, "VALIDATION_ERROR"), "fallback", "en"),
    ).toBe("slug must be lowercase");
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback", "en")).toBe(
      "Please correct the highlighted fields.",
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

  // C4 — table-driven translation of each static override into the operator's locale (es).
  it.each([
    ["FORBIDDEN", "No tienes permiso para hacer eso."],
    ["RESOURCE_CONFLICT", "Ese slug ya está en uso."],
  ])("translates the %s override into the operator's locale (es)", (code, expected) => {
    expect(describeApiError(new ApiError("raw", 400, code), "fallback", "es")).toBe(expected);
  });

  it("translates the VALIDATION_ERROR fallback into the operator's locale (es)", () => {
    expect(describeApiError(new ApiError("", 400, "VALIDATION_ERROR"), "fallback", "es")).toBe(
      "Corrige los campos resaltados.",
    );
  });

  it("falls back to English for an unrecognized locale", () => {
    expect(describeApiError(new ApiError("raw", 400, "FORBIDDEN"), "fallback", "xx")).toBe(
      "You do not have permission to do that.",
    );
  });
});

// C4 — dictionary-parity spot check for just the 3 keys this pass added.
describe("workspace-i18n — C4 keys", () => {
  const LOCALES = [
    "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
    "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
  ];
  const NEW_KEYS = [
    "You do not have permission to do that.",
    "That slug is already in use.",
    "Please correct the highlighted fields.",
  ];

  for (const key of NEW_KEYS) {
    for (const locale of LOCALES) {
      it(`t(${locale}, "${key}") is non-empty and translated`, () => {
        const translated = t(locale, key);
        expect(translated.length).toBeGreaterThan(0);
        expect(translated).not.toBe(key);
      });
    }
  }
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
