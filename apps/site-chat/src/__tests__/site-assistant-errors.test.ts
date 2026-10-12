import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NO_REPLY_REASON, visitorFacingError } from "../site-assistant-errors";

describe("visitorFacingError", () => {
  it("keeps the server's reason and drops its trailing period so the sentence reads once", () => {
    assert.equal(visitorFacingError({ error: new Error("Visitor AI is off.") }).message, "Couldn't get an answer: Visitor AI is off. Try again.");
  });

  it("stringifies a non-Error reason", () => {
    assert.equal(visitorFacingError({ error: NO_REPLY_REASON }).message, "Couldn't get an answer: the assistant sent no reply. Try again.");
  });

  it("falls back to a generic reason when the message is blank", () => {
    assert.equal(visitorFacingError({ error: new Error("  ") }).message, "Couldn't get an answer: something went wrong. Try again.");
    assert.equal(visitorFacingError({ error: undefined }).message, "Couldn't get an answer: something went wrong. Try again.");
  });

  it("maps each browser's fetch network TypeError to one plain reason", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
      assert.equal(visitorFacingError({ error: new TypeError(raw) }).message, "Couldn't get an answer: couldn't reach the site. Try again.");
    }
  });

  it("passes a non-network TypeError's own message through", () => {
    assert.equal(visitorFacingError({ error: new TypeError("x is not a function") }).message, "Couldn't get an answer: x is not a function. Try again.");
  });
});
