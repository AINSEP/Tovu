import assert from "node:assert/strict";
import test from "node:test";

import { EntityNotLiveError } from "@jini-ai/cms/core";
import { entityNotLiveResponse } from "../entity-not-live.js";

/**
 * @file S4 (web-high fix plan, 2026-09-24) RED coverage for the HTTP half of the generic
 * entity-liveness guard. Every route this plan touches puts `entityNotLiveResponse` first in its
 * error ladder and relies on this exact 409 envelope shape.
 */

test("entityNotLiveResponse: an EntityNotLiveError maps to 409 with its code and message", () => {
  const err = new EntityNotLiveError("redirect", "r1", "trashed");

  assert.deepEqual(entityNotLiveResponse(err), {
    status: 409,
    body: {
      error: "ENTITY_IN_TRASH: redirect 'r1' is in the Trash. Restore it from the Trash before changing it.",
      code: "ENTITY_IN_TRASH",
    },
  });
});

test("entityNotLiveResponse: any other error is left unhandled (returns null)", () => {
  assert.equal(entityNotLiveResponse(new Error("x")), null);
});
