/**
 * @file What the Google Sheets form destination reports back to the forms delivery ledger: the
 * contract's `FormDeliveryResult` and the translation from the plugin's safe Google errors to the
 * contract's nine codes.
 *
 * Exists because only the bare code, `retryable`, `retryAfterMs` and `outcome` ever reach the
 * ledger (the host drops everything else, and a thrown error would become a generic retryable
 * failure). So every failure of a delivery is turned into one of those values here, in one table,
 * and no message, Google text, token or answer ever leaves the adapter. What the person does next
 * for each code is documented in `skills/google-workspace/references/form-delivery.md`.
 */
import { GoogleWorkspaceError } from '../lib/request-policy.mjs';

/** A refusal decided by the adapter itself (config, mapping, dedupe limit, product off). */
export class DeliveryRefusal extends Error {
  /**
   * @param {{ code: string, retryable: boolean }} required A contract code; `message` is the code.
   * @param {{ outcome?: 'not-applied' | 'unknown' }} [optional] Defaults to `not-applied`: every
   *   adapter refusal happens before the append is sent, except the uncertain-append verdict.
   */
  constructor(required, optional = {}) {
    super(required.code);
    this.name = 'DeliveryRefusal';
    this.code = required.code;
    this.retryable = required.retryable;
    this.outcome = optional.outcome ?? 'not-applied';
  }
}

/**
 * Plugin safe code → [contract code, retryable]. Authorization problems are not retried (the
 * person reconnects; the failed job stays in the ledger), quota and transient failures are.
 */
const CONTRACT_CODES = new Map([
  ['not-connected', ['authorization-required', false]], ['reconnect-required', ['authorization-required', false]],
  ['account-changed', ['authorization-required', false]], ['missing-permission', ['authorization-required', false]],
  ['file-not-granted', ['resource-not-granted', false]], ['access-denied', ['resource-not-granted', false]],
  ['admin-policy', ['resource-not-granted', false]],
  ['quota-delay', ['rate-limited', true]],
  ['invalid-request', ['mapping-invalid', false]], ['invalid-input', ['configuration-invalid', false]],
  ['limit-exceeded', ['destination-limit', false]],
  ['uncertain-outcome', ['outcome-unknown', true]],
  ['product-disabled', ['adapter-unavailable', true]],
  ['conflict', ['delivery-failed', true]], ['service-unavailable', ['delivery-failed', true]], ['network-error', ['delivery-failed', true]],
]);

/** `{ ok: false, error }` with only the fields the contract keeps. @complexity O(1). */
export function failureResult(required, _optional = {}) {
  const { code, retryable, outcome, retryAfterMs } = required;
  return { ok: false, error: { code, retryable, ...(outcome ? { outcome } : {}), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) } };
}

/**
 * The result a failed delivery reports. A plugin error keeps its outcome and Retry-After; anything
 * unrecognised is a retryable `delivery-failed` with no outcome claimed, and its text is dropped.
 * @param {{ error: unknown }} required
 * @complexity O(1).
 */
export function resultForError(required, _optional = {}) {
  const { error } = required;
  if (error instanceof DeliveryRefusal) return failureResult(error);
  if (!(error instanceof GoogleWorkspaceError)) return failureResult({ code: 'delivery-failed', retryable: true });
  const [code, retryable] = CONTRACT_CODES.get(error.code) ?? ['delivery-failed', false];
  return failureResult({ code, retryable, outcome: error.outcome, retryAfterMs: error.retryAfterMs });
}
