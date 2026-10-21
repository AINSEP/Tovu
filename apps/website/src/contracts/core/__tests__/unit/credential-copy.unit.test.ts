import assert from "node:assert/strict";
import test from "node:test";
import { CREDENTIAL_COPY, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "../../credential-copy.js";
import { CREDENTIAL_MESSAGES, type CredentialMessageId } from "../../credential-token.js";

test("every offered locale translates every credential message id", () => {
  const ids = Object.keys(CREDENTIAL_MESSAGES).sort();
  for (const [locale, values] of Object.entries(CREDENTIAL_COPY)) {
    assert.deepEqual(Object.keys(values).sort(), ids, `${locale} must cover every message id`);
  }
});

test("credentialText returns the locale copy and defaults to English", () => {
  assert.equal(credentialText({ id: "blank", locale: "fr" }), "Saisissez un jeton. Des espaces seuls ne sont pas un jeton.");
  assert.equal(credentialText({ id: "blank" }), CREDENTIAL_MESSAGES.blank);
});

test("credentialText falls back to English for an unoffered locale", () => {
  assert.equal(credentialText({ id: "connected", locale: "xx-XX" }), "Connected.");
});

test("formatCredentialHint renders nothing without a hint", () => {
  assert.equal(formatCredentialHint({ hint: null }), "");
  assert.equal(formatCredentialHint({ hint: undefined, locale: "de" }), "");
});

test("formatCredentialHint shows the tail and the locale-formatted length", () => {
  assert.equal(formatCredentialHint({ hint: { length: 12345, last4: "wxyz" } }), "…wxyz, 12,345 chars");
  assert.equal(formatCredentialHint({ hint: { length: 40, last4: "abcd" }, locale: "de" }), "…abcd, 40 Zeichen");
});

test("formatCredentialHint omits the tail for short tokens", () => {
  assert.equal(formatCredentialHint({ hint: { length: 8, last4: null }, locale: "fr" }), "8 caractères");
});

test("formatCredentialHint separates a leading-dot tail from the ellipsis without rewriting it", () => {
  assert.equal(formatCredentialHint({ hint: { length: 20, last4: ".a1b" } }), "… .a1b, 20 chars");
});

test("translateCredentialMessage translates only known policy messages", () => {
  assert.equal(translateCredentialMessage({ message: CREDENTIAL_MESSAGES.auth, locale: "de" }), CREDENTIAL_COPY.de.auth);
  assert.equal(translateCredentialMessage({ message: CREDENTIAL_MESSAGES.auth }), CREDENTIAL_MESSAGES.auth);
  const unknown = "ECONNRESET at internal-host:9999";
  assert.equal(translateCredentialMessage({ message: unknown, locale: "de" }), unknown);
});

test("formatCredentialHints joins named hints and tolerates missing hints", () => {
  assert.equal(formatCredentialHints({
    hints: { API_TOKEN: { length: 30, last4: "9f9f" }, PIN: { length: 4, last4: null } },
  }), "API_TOKEN: …9f9f, 30 chars · PIN: 4 chars");
  assert.equal(formatCredentialHints({ hints: { PIN: { length: 4, last4: null } }, locale: "fr" }), "PIN: 4 caractères");
  assert.equal(formatCredentialHints({}), "");
});

test("credentialText resolves every id for every locale to a non-empty string", () => {
  for (const locale of Object.keys(CREDENTIAL_COPY)) {
    for (const id of Object.keys(CREDENTIAL_MESSAGES) as CredentialMessageId[]) {
      const text = credentialText({ id, locale });
      assert.ok(text.length > 0, `${locale}.${id}`);
    }
  }
});
