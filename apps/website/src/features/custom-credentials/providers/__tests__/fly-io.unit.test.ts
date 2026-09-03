import assert from "node:assert/strict";
import test from "node:test";

import { flyIoAuthSchemeProvider } from "../fly-io.js";
import { CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS, detectSelfDescribingAuthScheme } from "../index.js";

/**
 * @file Unit-level coverage for the fly.io self-describing-token recognizer and the registry that
 * dispatches to it — see `../index.ts`'s header for the design this pair implements, and
 * `../../__tests__/credentialed-request.unit.test.ts`/`../../__tests__/auth-failure-diagnostic.unit.test.ts`
 * for the end-to-end proof that `credentialed-request.ts` actually calls through to this registry.
 * Every fixture uses a SYNTHETIC token, never a real credential.
 */

test("flyIoAuthSchemeProvider.detect: a token starting with FlyV1 splits into scheme 'FlyV1' and everything after it as the value", () => {
  assert.deepEqual(flyIoAuthSchemeProvider.detect("FlyV1fake_test_token_value"), { scheme: "FlyV1", value: "fake_test_token_value" });
});

test("flyIoAuthSchemeProvider.detect: a token that IS exactly 'FlyV1', with nothing following it, does not match — there is no credential value left to send", () => {
  assert.equal(flyIoAuthSchemeProvider.detect("FlyV1"), null);
});

test("flyIoAuthSchemeProvider.detect: a token that merely CONTAINS 'FlyV1' later in the string, not as a leading prefix, does not match", () => {
  assert.equal(flyIoAuthSchemeProvider.detect("opaque_FlyV1_in_the_middle"), null);
});

test("flyIoAuthSchemeProvider.detect: an ordinary opaque token unrelated to FlyV1 does not match", () => {
  assert.equal(flyIoAuthSchemeProvider.detect("opaque-secret-token"), null);
});

test("flyIoAuthSchemeProvider.detect: the match is case-sensitive — a lowercase 'flyv1' prefix does not match", () => {
  assert.equal(flyIoAuthSchemeProvider.detect("flyv1fake_test_token_value"), null);
});

test("detectSelfDescribingAuthScheme: dispatches to the fly.io recognizer for a FlyV1-prefixed token", () => {
  assert.deepEqual(detectSelfDescribingAuthScheme("FlyV1fake_test_token_value"), { scheme: "FlyV1", value: "fake_test_token_value" });
});

test("detectSelfDescribingAuthScheme: returns null when no registered provider recognizes the token — the overwhelming majority of tokens", () => {
  assert.equal(detectSelfDescribingAuthScheme("opaque-secret-token"), null);
});

test("CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS: the fly.io provider is registered exactly once", () => {
  const flyEntries = CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS.filter((provider) => provider.id === "fly.io");
  assert.equal(flyEntries.length, 1);
});
