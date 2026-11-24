// ../core/dist/records.js
function isRecord(required, _optional = {}) {
  const { value } = required;
  return typeof value === "object" && value !== null;
}
function isNonArrayRecord(required, _optional = {}) {
  return isRecord(required) && !Array.isArray(required.value);
}

// ../cms/dist/forms/submission-evidence.js
var MAX_EVIDENCE_BYTES = 1024 * 1024;
function assertEvidenceSize({ value }) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_EVIDENCE_BYTES)
    throw new TypeError("Form submission evidence exceeds 1 MiB.");
}
function isField(value) {
  if (!isNonArrayRecord({ value }))
    return false;
  const field = value;
  const identity = typeof field.id === "string" && typeof field.label === "string" && typeof field.type === "string" && typeof field.required === "boolean";
  const choices = field.options === void 0 || Array.isArray(field.options) && field.options.every(isOption);
  return identity && choices;
}
function isOption(value) {
  return isNonArrayRecord({ value }) && typeof value.value === "string" && typeof value.label === "string";
}
function isConsent(value) {
  if (!isNonArrayRecord({ value }))
    return false;
  const consent = value;
  return typeof consent.fieldId === "string" && typeof consent.wording === "string" && (consent.helpText === void 0 || typeof consent.helpText === "string");
}
function readSubmissionEvidence({ value }, _optional = {}) {
  if (value === void 0 || value === null)
    return void 0;
  if (!isNonArrayRecord({ value }))
    throw new TypeError("Invalid form submission evidence.");
  const evidence = value;
  assertEvidenceHeader({ evidence });
  if (!Array.isArray(evidence.fields) || !evidence.fields.every(isField))
    throw new TypeError("Invalid form submission evidence fields.");
  if (!Array.isArray(evidence.consent) || !evidence.consent.every(isConsent))
    throw new TypeError("Invalid form submission evidence consent.");
  assertEvidenceSize({ value });
  return structuredClone(value);
}
function assertEvidenceHeader({ evidence }) {
  if (evidence.version !== 1 || typeof evidence.schemaHash !== "string" || !/^[a-f0-9]{64}$/.test(evidence.schemaHash))
    throw new TypeError("Invalid form submission evidence hash.");
  if (typeof evidence.capturedAt !== "string" || !["native", "cloudflare"].includes(String(evidence.source)))
    throw new TypeError("Invalid form submission evidence provenance.");
  if (evidence.html !== void 0 && typeof evidence.html !== "string")
    throw new TypeError("Invalid form submission evidence HTML.");
}
export {
  readSubmissionEvidence
};
