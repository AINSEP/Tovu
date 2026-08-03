import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSiteAssistantMode } from "../mode";

/**
 * These assert a security boundary, not a preference: `cli` mode spawns an OS process per anonymous
 * visitor (ADR-054). Every case that is not an unambiguous, deliberate opt-in must resolve to
 * `byok`. A test here going green on a `cli` result it did not intend is the failure mode that
 * matters, so each case asserts the mode explicitly rather than "not cli".
 */
describe("resolveSiteAssistantMode", () => {
  it("defaults to byok when nothing is set, and does not report a refusal", () => {
    const result = resolveSiteAssistantMode({});
    assert.equal(result.mode, "byok");
    // Absence of a request is not a denied request — a refusal line here would cry wolf in the log
    // on every ordinary boot, which is how operators learn to ignore the log.
    assert.equal(result.refusedReason, undefined);
  });

  it("grants cli only when BOTH the mode and the separate opt-in are set", () => {
    const result = resolveSiteAssistantMode({
      TOVU_SITE_ASSISTANT_MODE: "cli",
      TOVU_SITE_ASSISTANT_ALLOW_CLI: "1",
    });
    assert.equal(result.mode, "cli");
    assert.equal(result.refusedReason, undefined);
  });

  it("refuses cli when the mode is set but the opt-in is absent", () => {
    // The realistic accident: TOVU_SITE_ASSISTANT_MODE=cli copied from a dev env into a deploy.
    // On its own it must be inert.
    const result = resolveSiteAssistantMode({ TOVU_SITE_ASSISTANT_MODE: "cli" });
    assert.equal(result.mode, "byok");
    assert.match(result.refusedReason ?? "", /TOVU_SITE_ASSISTANT_ALLOW_CLI/);
  });

  it("treats non-'1' opt-in values as refusal, including truthy strings", () => {
    // "false" and "0" are both truthy JS strings. An operator who writes either plainly means no,
    // so this must not be a truthiness check.
    for (const value of ["false", "0", "true", "yes", "", " 1 "]) {
      const result = resolveSiteAssistantMode({
        TOVU_SITE_ASSISTANT_MODE: "cli",
        TOVU_SITE_ASSISTANT_ALLOW_CLI: value,
      });
      assert.equal(result.mode, "byok", `opt-in value ${JSON.stringify(value)} must not grant cli`);
    }
  });

  it("refuses cli under NODE_ENV=production even with a correct opt-in", () => {
    const result = resolveSiteAssistantMode({
      TOVU_SITE_ASSISTANT_MODE: "cli",
      TOVU_SITE_ASSISTANT_ALLOW_CLI: "1",
      NODE_ENV: "production",
    });
    assert.equal(result.mode, "byok");
    assert.match(result.refusedReason ?? "", /production/);
  });

  it("falls back to byok on an unrecognized mode rather than throwing or guessing", () => {
    const result = resolveSiteAssistantMode({ TOVU_SITE_ASSISTANT_MODE: "agent" });
    assert.equal(result.mode, "byok");
    assert.match(result.refusedReason ?? "", /not a recognized mode/);
  });

  it("accepts case and surrounding whitespace on the mode, since env vars are hand-edited", () => {
    const result = resolveSiteAssistantMode({
      TOVU_SITE_ASSISTANT_MODE: "  CLI  ",
      TOVU_SITE_ASSISTANT_ALLOW_CLI: "1",
    });
    assert.equal(result.mode, "cli");
  });

  it("explicit byok is honored silently, not reported as a refusal", () => {
    const result = resolveSiteAssistantMode({ TOVU_SITE_ASSISTANT_MODE: "BYOK" });
    assert.equal(result.mode, "byok");
    assert.equal(result.refusedReason, undefined);
  });
});
