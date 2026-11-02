import assert from "node:assert/strict";
import test from "node:test";
import { assertAdminResponse } from "./assert-admin-response.js";

test("share incident snapshots require a valid correlated ID, exact public text and no leaked fields", () => {
  const errorId = "00000000-0000-4000-8000-000000000001";
  const expected = { code: "SHARE_FAILED", message: "Share operation failed. Check storage configuration and retry." };
  const actual = { ...expected, errorId, message: `${expected.message} (error ${errorId})` };
  assert.doesNotThrow(() => assertAdminResponse({ actual, expected }));
  for (const invalid of [
    { ...actual, errorId: "invalid" }, { ...actual, message: expected.message },
    { ...actual, message: `SECRET (error ${errorId})` }, { ...actual, cause: "SECRET" },
  ]) assert.throws(() => assertAdminResponse({ actual: invalid, expected }));
});
