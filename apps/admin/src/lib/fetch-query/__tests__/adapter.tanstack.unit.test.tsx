import { describe, expect, it } from "vitest";

// Deliberately NOT importing from ".." (the public barrel) — see fetch-query.test.tsx's own
// header for why that file is restricted to the public surface only. resolveFetchQueryStatus and
// resolveFetchQueryError are internal to this one adapter (resolveFetchQueryStatus's own
// tanstackStatus parameter is TanStack's own "pending" vocabulary, which the public QueryStatus
// contract doesn't use), so a direct import from the adapter module is correct here, not a lapse.
import { resolveFetchQueryError, resolveFetchQueryStatus } from "../adapter.tanstack";

/**
 * @file Direct coverage for the two pure functions pulled out of `useFetchQuery`'s own body during
 * the 2026-08-06 complexity pass (nested ternaries flattened to top-level `if` chains — see each
 * function's own doc comment in `adapter.tanstack.tsx`). `fetch-query.test.tsx` already pins the
 * same behavior end-to-end through the public `useFetchQuery` hook; this exercises the branch
 * combinations directly, per this pass's rule that every extracted function gets its own test.
 */

describe("resolveFetchQueryStatus", () => {
  it("reports success when disabled with cached data", () => {
    expect(resolveFetchQueryStatus(true, true, "pending")).toBe("success");
  });

  it("reports loading when disabled with no data yet, regardless of tanstackStatus", () => {
    expect(resolveFetchQueryStatus(true, false, "pending")).toBe("loading");
    expect(resolveFetchQueryStatus(true, false, "error")).toBe("loading");
  });

  it("passes through error/success from tanstackStatus when enabled", () => {
    expect(resolveFetchQueryStatus(false, false, "error")).toBe("error");
    expect(resolveFetchQueryStatus(false, true, "success")).toBe("success");
  });

  it("folds tanstack's 'pending' into 'loading' when enabled", () => {
    expect(resolveFetchQueryStatus(false, false, "pending")).toBe("loading");
  });
});

describe("resolveFetchQueryError", () => {
  it("returns null when there is no raw error", () => {
    expect(resolveFetchQueryError(null, false, false)).toBeNull();
  });

  it("suppresses a cached failure that never succeeded, once disabled", () => {
    expect(resolveFetchQueryError(new Error("boom"), true, false)).toBeNull();
  });

  it("surfaces a failure from a later background refresh when disabled but data still exists", () => {
    const err = resolveFetchQueryError(new Error("boom"), true, true);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("boom");
  });

  it("surfaces the error while enabled, and normalises a non-Error throw via toError's fallback", () => {
    const err = resolveFetchQueryError("not an Error instance", false, false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("not an Error instance");
  });
});
