import { expect, test } from "vitest";

import { ApiError, describeApiError } from "../api";

/**
 * @file `describeApiError` — the shared base translation every screen's own per-`code` override
 * now falls through to (audit cross-cutting finding #2, consolidating ~two dozen copy-pasted
 * local definitions of this exact logic). Pins the base contract directly, independent of any one
 * screen's wiring: `Plugins.unit.test.tsx`'s existing AC-20 case already covers one screen's
 * override-then-fallthrough behavior end to end, so this file only needs the base function itself.
 */

test("an ApiError's own message wins over the fallback", () => {
  const error = new ApiError("that slug is taken", 409, "RESOURCE_CONFLICT");
  expect(describeApiError(error, "fallback text")).toBe("that slug is taken");
});

test("an ApiError with an empty message falls back", () => {
  const error = new ApiError("", 500);
  expect(describeApiError(error, "fallback text")).toBe("fallback text");
});

test("a plain Error's message is used as-is", () => {
  expect(describeApiError(new Error("network down"), "fallback text")).toBe("network down");
});

test("a non-Error thrown value uses the fallback", () => {
  expect(describeApiError("just a string", "fallback text")).toBe("fallback text");
  expect(describeApiError(undefined, "fallback text")).toBe("fallback text");
});
