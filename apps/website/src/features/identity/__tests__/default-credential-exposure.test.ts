import assert from "node:assert/strict";
import test from "node:test";

import {
  findSecretInText,
  scanForDefaultCredentialExposure,
} from "../default-credential-exposure.js";
import { DEFAULT_OWNER_PASSWORD } from "../wiring.js";

test("a line containing the secret is reported with its 1-based line number", () => {
  const src = ["import x from 'y';", `const hint = "use ${DEFAULT_OWNER_PASSWORD}";`, "export {};"].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [2]);
});

test("every occurrence is reported, not just the first", () => {
  const src = [`a = "${DEFAULT_OWNER_PASSWORD}"`, "b = 1", `c = "${DEFAULT_OWNER_PASSWORD}"`].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [1, 3]);
});

test("the secret embedded mid-string is still found — this is a containment check, not a token match", () => {
  // The original regression was `local dev default: admin / <password>` inside prose, not a bare
  // identifier, so a word-boundary matcher would have missed the exact bug this guards against.
  const src = `<p>local dev default: admin / ${DEFAULT_OWNER_PASSWORD}</p>`;
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), [1]);
});

test("unrelated content is not flagged", () => {
  const src = ["const a = 1;", "// nothing sensitive here", "export const b = 'placeholder';"].join("\n");
  assert.deepEqual(findSecretInText(src, DEFAULT_OWNER_PASSWORD), []);
});

test("the default password is non-empty — an empty value would make this whole guard vacuous", () => {
  // A guard that searches for "" matches every line of every file, or (depending on the matcher)
  // nothing at all. Either way it would stop being evidence, so assert the premise explicitly.
  assert.ok(DEFAULT_OWNER_PASSWORD.length > 0);
});

test("REGRESSION: the shipped admin UI does not contain the seeded default password", () => {
  // Guards the real, thrice-recurring bug: apps/admin/src/features/auth/Login.tsx rendering
  // `local dev default: admin / <password>` into the production sign-in page.
  assert.deepEqual(scanForDefaultCredentialExposure(), []);
});
