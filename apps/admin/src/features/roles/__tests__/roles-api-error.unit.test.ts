import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/admin-http/request";
import { describeApiError } from "../roles-host-binding";


/**
 * @file `describeApiError` as this host binds it (`roles-host-binding.ts` → `@jini-ai/admin/roles/rules`).
 *
 * `describeApiError` layers five `ApiError.code` overrides on top of the shared
 * `lib/api.ts` default; every branch is asserted individually plus the fallthrough case, since a
 * screen-specific error-copy table silently regressing to the generic message (or vice versa) is
 * exactly the "moved verbatim" contract the extraction claims and is otherwise unverified.
 */

describe("describeApiError", () => {
  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["RESOURCE_CONFLICT", "It is still in use — remove that assignment/attachment first."],
    ["PERMISSION_UNKNOWN", "That permission is not recognized."],
    ["GRANT_EXCEEDS_ISSUER", "You cannot grant a permission you do not hold."],
  ])("maps ApiError code %s to its screen-specific copy", (code, expected) => {
    const err = new ApiError({ message: "raw server message", status: 400 }, { code });
    expect(describeApiError({ e: err, fallback: "fallback", locale: "en" })).toBe(expected);
  });

  it("uses the ApiError's own message for VALIDATION_ERROR when present", () => {
    const err = new ApiError({ message: "Name is required", status: 400 }, { code: "VALIDATION_ERROR" });
    expect(describeApiError({ e: err, fallback: "fallback", locale: "en" })).toBe("Name is required");
  });

  it("falls back to the generic validation copy when VALIDATION_ERROR carries no message", () => {
    const err = new ApiError({ message: "", status: 400 }, { code: "VALIDATION_ERROR" });
    expect(describeApiError({ e: err, fallback: "fallback", locale: "en" })).toBe("Please correct the highlighted fields.");
  });

  it("defers to the shared default translation for an unrecognized ApiError code", () => {
    const err = new ApiError({ message: "some other server message", status: 500 }, { code: "SOME_OTHER_CODE" });
    expect(describeApiError({ e: err, fallback: "fallback", locale: "en" })).toBe("some other server message");
  });

  it.each([undefined, ""])("preserves the server message when the ApiError code is %s", (code) => {
    const err = new ApiError({ message: "Role service unavailable", status: 503 }, { code });
    expect(describeApiError({ e: err, fallback: "Could not load roles", locale: "es" })).toBe("Role service unavailable");
  });

  it("defers to the shared default translation for a plain Error", () => {
    expect(describeApiError({ e: new Error("network down"), fallback: "fallback", locale: "en" })).toBe("network down");
  });

  it("uses the fallback for a non-Error, non-ApiError thrown value", () => {
    expect(describeApiError({ e: "boom", fallback: "fallback", locale: "en" })).toBe("fallback");
  });

  // C4 — table-driven translation of each static override into the operator's locale (es).
  it.each([
    ["FORBIDDEN", "No tienes permiso para hacer eso."],
    ["RESOURCE_CONFLICT", "Todavía está en uso; primero quita esa asignación o adjunto."],
    ["PERMISSION_UNKNOWN", "Ese permiso no se reconoce."],
    ["GRANT_EXCEEDS_ISSUER", "No puedes otorgar un permiso que no posees."],
  ])("translates the %s override into the operator's locale (es)", (code, expected) => {
    expect(describeApiError({ e: new ApiError({ message: "raw", status: 400 }, { code }), fallback: "fallback", locale: "es" })).toBe(expected);
  });

  it("translates the VALIDATION_ERROR fallback into the operator's locale (es)", () => {
    expect(describeApiError({ e: new ApiError({ message: "", status: 400 }, { code: "VALIDATION_ERROR" }), fallback: "fallback", locale: "es" })).toBe(
      "Corrige los campos resaltados.",
    );
  });

  it("falls back to English for an unrecognized locale", () => {
    expect(describeApiError({ e: new ApiError({ message: "raw", status: 400 }, { code: "FORBIDDEN" }), fallback: "fallback", locale: "xx" })).toBe(
      "You do not have permission to do that.",
    );
  });
});
