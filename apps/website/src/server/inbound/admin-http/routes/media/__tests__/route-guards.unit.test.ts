import assert from "node:assert/strict";
import test from "node:test";
import { MediaValidationError } from "@jini-ai/cms/media";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import { sendMediaNotFound, sendValidationOrInternalError } from "../route-guards.js";

test("a missing asset names the requested media ID in the 404", () => {
  const { res, capture } = createCapturingResponse();
  sendMediaNotFound({ res, mediaId: "cover-87" });
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "media 'cover-87' was not found" } });
});

test("a media validation refusal exposes the actionable message and does not file an incident", () => {
  const { reporter, records, reports } = recordingComposedReporter();
  const { res, capture } = createCapturingResponse();
  res.locals.failureReporter = reporter;
  sendValidationOrInternalError({ res, error: new MediaValidationError({ message: "Crop width exceeds the original." }) });
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "Crop width exceeds the original." } });
  assert.deepEqual(records, []);
  assert.deepEqual(reports, []);
});
