import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";

import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "#src/features/redirects/index";
import {
  respondToRedirectError,
  REDIRECT_WRITE_ERROR_MAPPINGS,
  type RedirectErrorMapping,
} from "../shared.js";

function createMockResponse(): { res: Response; result: { status: number; body: unknown } } {
  const result = { status: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(data: unknown) {
      result.body = data;
      return res;
    },
  } as unknown as Response;
  return { res, result };
}

test("REDIRECT_WRITE_ERROR_MAPPINGS: maps RedirectValidationError to 400 REDIRECT_VALIDATION_ERROR", () => {
  const { res, result } = createMockResponse();
  const err = new RedirectValidationError("source cannot equal target");
  respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "source cannot equal target", code: "REDIRECT_VALIDATION_ERROR" });
});

test("REDIRECT_WRITE_ERROR_MAPPINGS: maps RedirectTargetNotAllowedError to 400 REDIRECT_TARGET_NOT_ALLOWED", () => {
  const { res, result } = createMockResponse();
  const err = new RedirectTargetNotAllowedError("disallowed domain");
  respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "disallowed domain", code: "REDIRECT_TARGET_NOT_ALLOWED" });
});

test("REDIRECT_WRITE_ERROR_MAPPINGS: maps RedirectConflictError to 409 REDIRECT_CONFLICT", () => {
  const { res, result } = createMockResponse();
  const err = new RedirectConflictError("duplicate rule");
  respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "duplicate rule", code: "REDIRECT_CONFLICT" });
});

test("REDIRECT_WRITE_ERROR_MAPPINGS: maps RedirectLoopError to 409 REDIRECT_LOOP_DETECTED", () => {
  const { res, result } = createMockResponse();
  const err = new RedirectLoopError("loop detected");
  respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "loop detected", code: "REDIRECT_LOOP_DETECTED" });
});

test("respondToRedirectError: falls back to 500 when error does not match any mapping", () => {
  const { res, result } = createMockResponse();
  const err = new Error("unknown database crash");
  respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("respondToRedirectError: handles non-Error thrown objects with custom mappings", () => {
  const { res, result } = createMockResponse();
  const customMappings: RedirectErrorMapping[] = [
    { matches: (e) => typeof e === "string" && e.includes("custom"), status: 418, code: "TEAPOT" },
  ];
  respondToRedirectError(res, "custom string failure", customMappings);
  assert.equal(result.status, 418);
  assert.deepEqual(result.body, { error: "custom string failure", code: "TEAPOT" });
});
