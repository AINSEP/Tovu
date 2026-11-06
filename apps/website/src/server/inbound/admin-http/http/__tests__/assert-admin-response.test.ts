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

const incidentId = "00000000-0000-4000-8000-000000000001";
const incidentTime = "2026-11-05T18:00:00.000Z";
const failureCopy = { message: "The pages could not be loaded.", action: "Try loading them again.", step: "Load pages" };
const expectedFailure = {
  ...failureCopy, cause: "The error ID identifies the server report.", errorId: incidentId, time: incidentTime,
  copyText: [
    "Message: The pages could not be loaded.", "Next action: Try loading them again.",
    `Error ID: ${incidentId}`, "Step: Load pages", "Cause: The error ID identifies the server report.",
    `Time: ${incidentTime}`,
  ].join("\n"),
};
const responseWithFailure = {
  code: "INTERNAL_ERROR", errorId: incidentId,
  error: `The pages could not be loaded. Try loading them again. (error ${incidentId})`,
  details: { failure: expectedFailure },
};

test("failure snapshots require explicitly specified copy and independently verify the whole copy block", () => {
  const expected = { error: "internal error", code: "INTERNAL_ERROR" };
  assert.doesNotThrow(() => assertAdminResponse({ actual: responseWithFailure, expected }, { failure: failureCopy }));
  assert.throws(() => assertAdminResponse({ actual: responseWithFailure, expected }));
  const staleCopy = `${expectedFailure.copyText}\nApp version: Unavailable\nJini version: Unavailable`;
  assert.throws(() => assertAdminResponse({ actual: { ...responseWithFailure, details: { failure: { ...expectedFailure, copyText: staleCopy } } }, expected }, { failure: failureCopy }));
  for (const field of ["message", "action", "step", "cause", "copyText"]) {
    const actual = { ...responseWithFailure, details: { failure: { ...expectedFailure, [field]: "WRONG" } } };
    assert.throws(() => assertAdminResponse({ actual, expected }, { failure: failureCopy }), field);
  }
  for (const time of ["yesterday", "2026-02-30T18:00:00.000Z", "2026-11-05", "2026-11-05T18:00:00Z"]) {
    const actual = { ...responseWithFailure, details: { failure: { ...expectedFailure, time } } };
    assert.throws(() => assertAdminResponse({ actual, expected }, { failure: failureCopy }), time);
  }
  assert.throws(() => assertAdminResponse({ actual: { ...responseWithFailure, unexpected: "PRIVATE" }, expected }, { failure: failureCopy }));
});

test("explicit public messages retain their exact text unless action inclusion is specified", () => {
  const expected = { code: "SHARE_FAILED", message: "Archive could not finish." };
  const failure = { ...failureCopy, message: expected.message };
  const copyText = expectedFailure.copyText.replace("Message: The pages could not be loaded.", `Message: ${expected.message}`);
  const details = { failure: { ...expectedFailure, message: expected.message, copyText } };
  const actual = { ...expected, errorId: incidentId, message: `${expected.message} (error ${incidentId})`, details };
  assert.doesNotThrow(() => assertAdminResponse({ actual, expected }, { failure }));
  const withAction = { ...actual, message: `${expected.message} ${failure.action} (error ${incidentId})` };
  assert.throws(() => assertAdminResponse({ actual: withAction, expected }, { failure }));
  assert.doesNotThrow(() => assertAdminResponse({ actual: withAction, expected }, { failure: { ...failure, includeAction: true } }));
});

test("an explicit false keeps a literal override's action out of the legacy public field", () => {
  const expected = { code: "INTERNAL_ERROR", error: "internal error" };
  const actual = { ...responseWithFailure, error: `${failureCopy.message} (error ${incidentId})` };
  assert.doesNotThrow(() => assertAdminResponse({ actual, expected }, { failure: { ...failureCopy, includeAction: false } }));
  assert.throws(() => assertAdminResponse({ actual, expected }, { failure: failureCopy }));
});

test("anonymous failure snapshots require exact safe text and reject any extra details", () => {
  const { details: _privateDetails, ...actual } = responseWithFailure;
  const expected = { code: "INTERNAL_ERROR", error: "internal error" };
  const failure = { ...failureCopy, discloseDetails: false };
  assert.doesNotThrow(() => assertAdminResponse({ actual, expected }, { failure }));
  assert.throws(() => assertAdminResponse({ actual: { ...actual, details: { failure: { cause: "SECRET_CANARY" } } }, expected }, { failure }));
});
