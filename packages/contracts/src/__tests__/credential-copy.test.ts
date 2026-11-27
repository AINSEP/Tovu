import assert from "node:assert/strict";
import test from "node:test";

import { CREDENTIAL_MESSAGES, type CredentialMessageId } from "@jini-ai/platform/secrets/credential-token";
import { ADMIN_LOCALES } from "../admin-locales.js";
import { CREDENTIAL_COPY, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "../credential-copy.js";

test("each offered admin locale has a unique canonical code and a visible language label", () => {
  const codes = ADMIN_LOCALES.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(ADMIN_LOCALES[0], { code: "en", label: "English" });
  for (const { code, label } of ADMIN_LOCALES) {
    assert.deepEqual(Intl.getCanonicalLocales(code), [code]);
    assert.notEqual(label.trim(), "", code);
  }
  const chinese = ADMIN_LOCALES.filter(({ code }) => code.startsWith("zh-"));
  assert.deepEqual(Object.fromEntries(chinese.map(({ code, label }) => [code, label])), { "zh-CN": "简体中文", "zh-TW": "繁體中文" });
});

test("credential translation catalogs cover every offered non-English locale and preserve English placeholders", () => {
  const ids = Object.keys(CREDENTIAL_MESSAGES).sort() as CredentialMessageId[];
  const placeholders = (value: string) => value.match(/\{\w+\}/g)?.sort() ?? [];
  assert.deepEqual(Object.keys(CREDENTIAL_COPY).sort(), ADMIN_LOCALES.map(({ code }) => code).filter(code => code !== "en").sort());
  for (const [locale, catalog] of Object.entries(CREDENTIAL_COPY)) {
    assert.deepEqual(Object.keys(catalog).sort(), ids, locale);
    for (const id of ids) {
      const translation = catalog[id];
      assert.notEqual(translation.trim(), "", `${locale}.${id}`);
      assert.deepEqual(placeholders(translation), placeholders(CREDENTIAL_MESSAGES[id]), `${locale}.${id}`);
    }
  }
});

test("credential lookup translates fixed messages and leaves unknown locale or message unchanged", () => {
  const english = "The server rejected this token.";
  assert.equal(credentialText({ id: "auth" }), english);
  assert.equal(credentialText({ id: "auth", locale: "es" }), "El servidor rechazó este token.");
  assert.equal(credentialText({ id: "auth", locale: "en-NZ" }), english);
  assert.equal(translateCredentialMessage({ message: english }), english);
  assert.equal(translateCredentialMessage({ message: english, locale: "es" }), "El servidor rechazó este token.");
  assert.equal(translateCredentialMessage({ message: "The provider rejected this token.", locale: "es" }), "The provider rejected this token.");
});

test("credential hints hide short tails, localize length, and preserve a literal leading dot", () => {
  assert.equal(formatCredentialHint({ hint: undefined }), "");
  assert.equal(formatCredentialHint({ hint: { length: 8, last4: null } }), "8 chars");
  assert.equal(formatCredentialHint({ hint: { length: 1200, last4: "z9_-"}, locale: "de" }), "…z9_-, 1.200 Zeichen");
  assert.equal(formatCredentialHints({}), "");
  assert.equal(formatCredentialHints({ hints: { PRIMARY: { length: 24, last4: ".a9_" }, FALLBACK: { length: 7, last4: null } }, locale: "es" }),
    "PRIMARY: …\u202f.a9_, 24 caracteres · FALLBACK: 7 caracteres");
  assert.equal(formatCredentialHints({ hints: { PRIMARY: { length: 8, last4: null } } }), "PRIMARY: 8 chars");
});
