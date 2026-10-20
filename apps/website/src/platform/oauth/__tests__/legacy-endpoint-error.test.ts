import assert from "node:assert/strict";
import test from "node:test";
import { OAuthError } from "@jini-ai/oauth";

import { toLegacyEndpointError } from "../legacy-endpoint-error.js";

test("non-OAuth failures pass through with their identity intact", () => {
  const failure = new RangeError("fixture engine failure");
  assert.equal(toLegacyEndpointError({ error: failure }), failure);
  assert.equal(toLegacyEndpointError({ error: failure }, { prefix: "token endpoint: " }), failure);
});

test("a doubled endpoint subject is repaired and the original cause is kept", () => {
  const cause = new Error("fixture policy cause");
  const error = new OAuthError({ code: "OAUTH_UNSAFE_ENDPOINT", message: "provider endpoint: provider endpoint is not a valid absolute URL",
    operatorAction: "Check the OAuth endpoints configured for this provider." }, { cause });
  const translated = toLegacyEndpointError({ error });
  assert.ok(translated instanceof OAuthError);
  assert.notEqual(translated, error);
  assert.equal(translated.code, "OAUTH_UNSAFE_ENDPOINT");
  assert.equal(translated.message, "provider endpoint is not a valid absolute URL");
  assert.equal(translated.operatorAction, "Check the OAuth endpoints configured for this provider.");
  assert.equal(translated.cause, cause);
});

test("a link subject carrying Tovu's endpoint wording is repaired to the link subject alone", () => {
  const error = new OAuthError({ code: "OAUTH_UNSAFE_ENDPOINT", message: "provider-supplied link: provider endpoint resolves to an internal address",
    operatorAction: "Point this provider at a publicly reachable authorization server." });
  const translated = toLegacyEndpointError({ error });
  assert.ok(translated instanceof OAuthError);
  assert.equal(translated.message, "provider-supplied link resolves to an internal address");
});

test("a prefix wraps the label-free legacy error as the cause of a labelled one", () => {
  const error = new OAuthError({ code: "OAUTH_UNSAFE_ENDPOINT", message: "provider endpoint: provider endpoint must use https",
    operatorAction: "Use an https:// URL for this provider." });
  const translated = toLegacyEndpointError({ error }, { prefix: "token endpoint: " });
  assert.ok(translated instanceof OAuthError);
  assert.equal(translated.message, "token endpoint: provider endpoint must use https");
  assert.equal(translated.operatorAction, "Use an https:// URL for this provider.");
  assert.ok(translated.cause instanceof OAuthError);
  assert.equal(translated.cause.message, "provider endpoint must use https");
  assert.equal(translated.cause.cause, undefined);
});
