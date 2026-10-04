import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { classifySiteTokenGenerateError } from "../hooks/use-site-token.hooks";

/**
 * @file `classifySiteTokenGenerateError` against the refusals `POST .../site-token/generate` sends
 * since 2026-09-29 (`routes/system/site-token.ts`'s `REFUSALS`): each is `409 {error: CODE,
 * detail}`, which `lib/api.ts`'s `request` turns into an `ApiError` whose message is the code and
 * whose body carries the plain-words `detail`. `ENV_VAR_ACTIVE` is no longer sent.
 */

const t = (key: string): string => key;

function refusal(code: string, detail: string): ApiError {
  return new ApiError(code, 409, undefined, { error: code, detail });
}

describe("classifySiteTokenGenerateError", () => {
  it("KEY_DEPENDENT_DATA → 'locked', carrying the server's own words", () => {
    const detail = "This site has saved credentials locked with a site key that is not on this computer.";
    expect(classifySiteTokenGenerateError(refusal("KEY_DEPENDENT_DATA", detail), t)).toEqual({ kind: "locked", code: "KEY_DEPENDENT_DATA", detail });
  });

  it("KEY_MISMATCH → 'locked'", () => {
    const detail = "The site key on this computer is not the one this site's saved credentials were locked with.";
    expect(classifySiteTokenGenerateError(refusal("KEY_MISMATCH", detail), t)).toEqual({ kind: "locked", code: "KEY_MISMATCH", detail });
  });

  it("KEY_INVALID and SITE_META_UNREADABLE → 'refused', carrying the server's own words", () => {
    expect(classifySiteTokenGenerateError(refusal("KEY_INVALID", "not a valid key"), t)).toEqual({ kind: "refused", code: "KEY_INVALID", detail: "not a valid key" });
    expect(classifySiteTokenGenerateError(refusal("SITE_META_UNREADABLE", "cannot be read"), t)).toEqual({ kind: "refused", code: "SITE_META_UNREADABLE", detail: "cannot be read" });
  });

  it("ALREADY_EXISTS (a production race) → 'already-exists'", () => {
    expect(classifySiteTokenGenerateError(refusal("ALREADY_EXISTS", "exists"), t)).toEqual({ kind: "already-exists" });
  });

  it("ENV_VAR_ACTIVE is no longer a known code → 'generic'", () => {
    expect(classifySiteTokenGenerateError(new ApiError("ENV_VAR_ACTIVE", 409), t).kind).toBe("generic");
  });

  it("a non-ApiError → 'generic'", () => {
    expect(classifySiteTokenGenerateError(new Error("boom"), t)).toEqual({ kind: "generic", detail: "boom" });
  });
});
