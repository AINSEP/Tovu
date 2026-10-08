/** Localized visitor copy stays with Tovu; email validation tests live in Jini. */
import assert from "node:assert/strict";
import test from "node:test";
import { formValidationMessages } from "#src/server/inbound/public-http/http/site/form-validation-message";

test("15b invalid_email uses the existing localized, exact visitor copy", () => {
  const formHtml = '<form><input type="email" name="email" aria-label="Email"></form>';
  assert.deepEqual(formValidationMessages({ formHtml, locale: "en", errors: [{ field: "email", reason: "invalid_email" }] }), [{ field: "email", message: "Please check your email." }]);
  assert.deepEqual(formValidationMessages({ formHtml, locale: "ar", errors: [{ field: "email", reason: "invalid_email" }] }), [{ field: "email", message: "يرجى التحقق من Email." }]);
});
