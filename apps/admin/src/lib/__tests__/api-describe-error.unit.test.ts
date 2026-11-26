import { expect, test } from "vitest";

import { ApiError, describeApiError } from "../admin-http/request";

/**
 * @file `describeApiError` — the shared base translation every screen's own per-`code` override
 * now falls through to (audit cross-cutting finding #2, consolidating ~two dozen copy-pasted
 * local definitions of this exact logic). Pins the base contract directly, independent of any one
 * screen's wiring: `Plugins.unit.test.tsx`'s existing AC-20 case already covers one screen's
 * override-then-fallthrough behavior end to end, so this file only needs the base function itself.
 */

test("an ApiError's own message wins over the fallback", () => {
  const error = new ApiError({ message: "that slug is taken", status: 409 }, { code: "RESOURCE_CONFLICT" });
  expect(describeApiError({ e: error, fallback: "fallback text" })).toBe("that slug is taken");
});

test("an ApiError with an empty message falls back", () => {
  const error = new ApiError({ message: "", status: 500 });
  expect(describeApiError({ e: error, fallback: "fallback text" })).toBe("fallback text");
});

test("a plain network Error uses the fallback", () => {
  expect(describeApiError({ e: new Error("network down"), fallback: "fallback text" })).toBe("fallback text");
});

test("a plain Error without an explanation uses the call site's recovery message", () => {
  expect(describeApiError({ e: new Error(""), fallback: "The page could not be saved. Keep your edits and check the saved page." })).toBe("The page could not be saved. Keep your edits and check the saved page.");
});

test("a non-Error thrown value uses the fallback", () => {
  expect(describeApiError({ e: "just a string", fallback: "fallback text" })).toBe("fallback text");
  expect(describeApiError({ e: undefined, fallback: "fallback text" })).toBe("fallback text");
});

test("an unexpected Error cannot expose a private path or a synthetic credential in admin copy", () => {
  const e = new Error("open failed: /Users/someone/private/site.db token=sk_test_SYNTHETIC_PRIVATE");
  expect(describeApiError({ e, fallback: "The page could not be saved." })).toBe("The page could not be saved.");
});
