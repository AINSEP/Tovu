/**
 * @file Test-fixture PUSH form destination for the fake "acme-office" plugin: appends each form
 * submission as one row of the table the binding names, using the OAuth access token the host
 * resolved from the binding's connectionRef for this attempt. Shaped per the forms-multidest
 * delivery contract (plain objects in, FormDeliveryResult out); the API origin is the plugin's own,
 * since an OAuth credential carries no base URL.
 */
export default {
  async deliver({ kit, credential, form, submission, binding, idempotencyKey }, _optional = {}) {
    const values = Object.fromEntries(form.fields.map((field) => [field.label ?? field.name, submission.answers[field.name] ?? ""]));
    let response;
    try {
      response = await kit.fetch(`https://api.acme.test/tables/${encodeURIComponent(String(binding.config.table ?? ""))}/rows`, {
        method: "POST",
        headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ values: { _submission_id: submission.id, submitted_at: submission.submittedAt, ...values } }),
      }, { timeoutMs: 15_000 });
    } catch {
      // The request may have reached the provider; the idempotency key makes the retry safe.
      return { ok: false, error: { code: "outcome-unknown", retryable: true, outcome: "unknown" } };
    }
    if (response.ok) return { ok: true };
    if (response.status === 401) return { ok: false, error: { code: "authorization-required", retryable: false, outcome: "not-applied" } };
    return { ok: false, error: { code: "delivery-failed", retryable: response.status >= 500, outcome: "not-applied" } };
  },
};
