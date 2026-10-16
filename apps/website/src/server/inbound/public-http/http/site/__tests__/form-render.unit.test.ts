import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  clearFormSubmissionResultQueryParams,
  decodeFormFlashCookieValue,
  decodeFormSubmissionResultFromQuery,
  encodeFormSubmissionResultQuery,
} from "../form-render.js";

/**
 * @file Form-result query and flash-cookie boundaries, for the parts `render.test.ts`'s
 * round-trip tests cannot see.
 *
 * A round trip (encode → decode) passes even when encode writes too much, because decode caps and
 * clamps on its own. And `clearFormSubmissionResultQueryParams` had no direct test at all: if it
 * missed a key, a second submission from the same page would carry the first one's stale
 * `form_errors`/`form_retry_after` in its redirect Location.
 */

test("clearFormSubmissionResultQueryParams removes all four form_* keys and keeps the page's own params", () => {
  const params = new URLSearchParams(
    "utm_source=mail&form=contact&form_status=validation&form_errors=%5B%5D&form_retry_after=30&page=2"
  );

  clearFormSubmissionResultQueryParams(params);

  assert.equal(params.toString(), "utm_source=mail&page=2");
});

test("encode: success writes exactly the slug and status, no errors or retry key", () => {
  assert.equal(encodeFormSubmissionResultQuery({ kind: "success", slug: "contact" }).toString(), "form=contact&form_status=success");
});

test("encode: validation writes at most 20 field errors — the first 20, in order", () => {
  const fieldErrors = Array.from({ length: 25 }, (_, i) => ({ field: `f${i}`, reason: "Required" }));

  const params = encodeFormSubmissionResultQuery({ kind: "validation", slug: "contact", fieldErrors });

  const written = JSON.parse(params.get("form_errors") ?? "null") as Array<{ field: string }>;
  assert.equal(written.length, 20);
  assert.equal(written[0].field, "f0");
  assert.equal(written[19].field, "f19");
  assert.equal(params.get("form_status"), "validation");
  assert.equal(params.has("form_retry_after"), false);
});

test("encode: rate-limited writes status 'rate_limited' and a whole, non-negative retry-after", () => {
  const fractional = encodeFormSubmissionResultQuery({ kind: "rate-limited", slug: "contact", retryAfterSeconds: 12.9 });
  assert.equal(fractional.get("form_status"), "rate_limited");
  assert.equal(fractional.get("form_retry_after"), "12");
  assert.equal(fractional.has("form_errors"), false);

  const negative = encodeFormSubmissionResultQuery({ kind: "rate-limited", slug: "contact", retryAfterSeconds: -5 });
  assert.equal(negative.get("form_retry_after"), "0");
});

test("decode: skips field errors without a non-empty string field and keeps valid errors", () => {
  const result = decodeFormSubmissionResultFromQuery({
    form: "contact",
    form_status: "validation",
    form_errors: JSON.stringify([
      null, [], true, { reason: "required" }, { field: "", reason: "required" },
      { field: 42, reason: "required" }, { field: "email", reason: "invalid" },
    ]),
  });

  assert.deepEqual(result, {
    kind: "validation", slug: "contact", fieldErrors: [{ field: "email", reason: "invalid" }],
  });
});

test("decode: rejects field-error JSON over 4000 characters even when it is valid JSON", () => {
  const errors = [{ field: "email", reason: "required" }];
  const query = { form: "contact", form_status: "validation" };
  const raw = JSON.stringify(errors).padEnd(4000, " ");

  assert.deepEqual(decodeFormSubmissionResultFromQuery({ ...query, form_errors: raw }), {
    kind: "validation", slug: "contact", fieldErrors: errors,
  });
  assert.deepEqual(decodeFormSubmissionResultFromQuery({ ...query, form_errors: `${raw} ` }), {
    kind: "validation", slug: "contact", fieldErrors: [],
  });
});

test("decode: ignores a result without a non-empty string form slug", () => {
  for (const form of [undefined, "", 42, ["contact"]]) {
    assert.equal(decodeFormSubmissionResultFromQuery({ form, form_status: "success" }), undefined);
  }
});

test("decode flash: JSON null is ignored without throwing", () => {
  assert.equal(decodeFormFlashCookieValue("null"), undefined);
});

test("decode flash: rejects a missing, empty or non-string slug even with valid values", () => {
  for (const slug of [undefined, "", 42]) {
    assert.equal(decodeFormFlashCookieValue(JSON.stringify({ slug, values: { email: "ada@example.com" } })), undefined);
  }
});
