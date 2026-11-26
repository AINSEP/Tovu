import { ToolPermissionDeniedError as ForbiddenError } from '@jini-ai/core';
import { forbiddenRule, type ModelFacingErrorRule, type CallerSafeErrorRule } from '@jini-ai/core/model-facing-tool-errors';
import { CredentialedRequestValidationError } from '@jini-ai/integrations/credentialed-http';
import type { CredentialToolOperations } from '@jini-ai/integrations/credentialed-http/tools';
import { CustomCredentialNotFoundError, CustomCredentialSecretStoreUnconfiguredError, CustomCredentialValidationError } from './store.js';

/**
 * The custom-credentials errors that reach the model with their real reason instead of a redacted
 * `INTERNAL_ERROR` — see `contracts/core/model-facing-tool-errors.ts` for the mechanism, for why a
 * whole-map wrap is used rather than a per-call-site reshape, and for why this list is an
 * ALLOWLIST: anything unlisted is returned unchanged and stays redacted.
 *
 * The shared handlers already rescue request and file-write shape rejections, but
 * only around the calls they wrap. Every other throw — the kit's `ForbiddenError` on all seven tools,
 * a wrong label on the five that resolve one, `set_username`/`set_token`'s own field checks, and the
 * DELETE pre-check — reached the model as the same opaque 500 a crash produces. No class below
 * extends another, so order is not load-bearing here. A rejection a predicate already turned into a
 * `ToolInputError` passes through untouched, so nothing gains a second prefix.
 *
 * On disclosure, checked at each construction site because this domain holds live tokens:
 * - `CustomCredentialNotFoundError` names only the label the caller sent or a row id
 *   (`credentialed-request.ts` 708/730, `store.ts` 494, and this file's three throws). Every one runs
 *   AFTER `requireToolPermission`, so a denied principal cannot use it to enumerate labels.
 * - `CustomCredentialValidationError` names field NAMES and fixed rules, never a field value:
 *   `rejectUnexpectedSet{Username,Token}Fields` echo the offending KEYS (a smuggled token's value is
 *   never read), `requireUsernameOrClearSentinel` and `store.ts` 140-263 are fixed strings.
 * - `CredentialedRequestValidationError` echoes the caller's own `url` (credentials-in-URL is refused
 *   first, with fixed text), header KEYS, a byte count, and the credential's saved origins, which
 *   `custom_credential_list` already returns. GET/POST already surface this class; listing it closes
 *   the DELETE pre-check arm only.
 *
 * Deliberately NOT listed, and so still redacted:
 * - `CustomCredentialSecretStoreUnconfiguredError`: its decrypt arm embeds the sealer's or
 *   `JSON.parse`'s own message, and `JSON.parse` quotes the start of its input — decrypted plaintext.
 * - `CredentialedRequestTransportError`: embeds raw transport text (`connect ECONNREFUSED <ip>:443`).
 * - `EgressRefusedError` at map level: its `message` names a resolved address. It surfaces only
 *   through the shared request handler, in its address-free form.
 * - `CustomCredentialDuplicateLabelError`: never escapes as a throw (`mapCreateCredentialError`).
 * - `write_files`' plan-failure `Error`, which carries GitHub's own rejection text (a network failure
 *   is already reduced to fixed text by the plugin provider (`provider-module.ts`)'s `describeSendFailure`), and
 *   internal-invariant `Error`.
 *
 * The structured `{ saved: false }` / `{ created: false }` / `{ executed: false }` results are return
 * values, not throws, and this wrap never sees them. The two form-save failures go through their own
 * allowlist, {@link FORM_SAVE_CALLER_SAFE_ERRORS}.
 */
export const CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  forbiddenRule({ domainPrefix: "CUSTOM_CREDENTIALS", error: ForbiddenError }),
  { error: CustomCredentialNotFoundError, code: "CUSTOM_CREDENTIALS_NOT_FOUND", guidance: "Call credential_save with kind api to open the secure credential card, then retry once." },
  { error: CustomCredentialValidationError, code: "CUSTOM_CREDENTIALS_VALIDATION_FAILED" },
  { error: CredentialedRequestValidationError, code: "CUSTOM_CREDENTIALS_REQUEST_REJECTED" },
  // A FIXED message, never `err.message`: this class wraps the sealer's, the keyring's, or
  // `JSON.parse`'s own text, which can carry the decrypted token, the env var name, and an absolute
  // key-file path — the identical disclosure {@link FORM_SAVE_CALLER_SAFE_ERRORS} already refuses for
  // this same class on the SAVE path. Its KIND, though, is the one failure in this domain an operator
  // can actually act on, and until 2026-09-18 it was the only one that reached the model redacted:
  // a site booted with no site key answered `500 INTERNAL_ERROR` on every credentialed call, which is
  // indistinguishable from the site having crashed. Listed LAST because it is the broadest of the
  // four — no ordering hazard today (no class here subclasses another), but the safe habit.
  {
    error: CustomCredentialSecretStoreUnconfiguredError,
    code: "CUSTOM_CREDENTIALS_SECRET_STORE_UNAVAILABLE",
    message:
      "this site's secret store could not open the saved credential: its Site key is missing or unusable, " +
      "or the stored credential is unreadable. No request was sent",
    guidance: "An operator can check this site's token on the admin Secrets page.",
  },
];


/**
 * The errors whose kind a failed form SAVE (`custom_credential_set_token`, `custom_credential_create`)
 * may name — to the model in the structured result, and to the human in the outcome resource.
 * Anything unlisted gets {@link FORM_SAVE_FAILURE_MESSAGE}. See `callerSafeErrorMessage` in
 * `contracts/core/model-facing-tool-errors.ts` for the mechanism.
 *
 * Both handlers used to publish `err.message` for ANY error, under a comment claiming none of these
 * messages ever embeds a field value. That was false: `store.ts`'s `sealConnection` wraps the sealer's
 * own failure text, the sealer is handed the submitted token as plaintext, and `decryptRecord`'s
 * `JSON.parse` arm shows the shape (it quotes its input). With the shipped `EnvOrFileKeyring`, a
 * missing site key put the env var name and the absolute key-file path on screen. A raw repo error
 * went out verbatim.
 *
 * - `CustomCredentialValidationError`, `CustomCredentialNotFoundError`: verbatim. Fixed text, field
 *   names, and a row id — the same disclosure proof `CUSTOM_CREDENTIALS_MODEL_FACING_ERRORS` records.
 * - `CustomCredentialSecretStoreUnconfiguredError`: a FIXED message. Its kind is the actionable reason
 *   an operator needs; its text wraps the sealer's, keyring's, or `JSON.parse`'s, so it never goes out.
 *
 * `CustomCredentialDuplicateLabelError` never reaches this list: `mapCreateCredentialError` answers it
 * first with its own message.
 */
export const FORM_SAVE_CALLER_SAFE_ERRORS: readonly CallerSafeErrorRule[] = [
  { error: CustomCredentialValidationError },
  { error: CustomCredentialNotFoundError },
  {
    error: CustomCredentialSecretStoreUnconfiguredError,
    message:
      "The site's secret store could not seal or open this credential: its Site key is missing or unusable, or the stored credential is unreadable. Nothing was saved.",
  },
];

/** What a form SAVE failure outside {@link FORM_SAVE_CALLER_SAFE_ERRORS} publishes. True for every
 *  throw inside either handler's `try`: the repo write is the last step that can fail. */
const FORM_SAVE_FAILURE_MESSAGE = "Saving failed because of an internal server error. Nothing was saved. The server log has the details.";


export function credentialOperationMessages(): CredentialToolOperations['messages'] {
  return {
      formSaveFailure: FORM_SAVE_FAILURE_MESSAGE,
      noCreateChannel: "custom_credential_create: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a credential cannot be created here. Nothing was changed.",
      noRotateChannel: "custom_credential_set_token: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a token cannot be collected here. Nothing was changed.",
      noDeleteChannel: "custom_credential_make_request: this execution context has no interactive confirmation channel " +
        "(no emitSurface), so a DELETE cannot be gated here. Nothing was sent.",
      runEnded: "The run ended. Nothing was changed.",
      invalidWorksFor: "worksFor must be an array of non-secret host or vendor IDs.",
      unlabeled: '(unlabeled)',
      missingUsername: "'username' is required — pass a non-empty string to set it, or null to clear it",
      invalidUsername: "'username' must be a non-empty string, or null to clear it",
      probeOriginMismatch: 'The saved origin no longer matches this key card. Nothing was saved.',
      unexpectedUsername: ({ keys }) => `custom_credential_set_username accepts only 'label' and 'username' — refusing unexpected field(s): ${keys.join(", ")}. ` +
        "This tool writes ONLY the plaintext username column; it can never accept, read, or change a token.",
      unexpectedToken: ({ keys }) => `custom_credential_set_token accepts only 'label' — refusing unexpected field(s): ${keys.join(", ")}. ` +
        "The token itself can only be supplied by a human, through the form this tool renders — never by this call.",
      notFoundLabel: ({ label }) => `no custom credential labeled '${label}' in this workspace`,
      notFoundId: ({ id }) => `no custom credential '${id}' in this workspace`,
      duplicateLabel: ({ label }) => `A custom credential labeled '${label}' already exists in this workspace. To rotate its token, use credential_save with kind api and target set to this label — ` +
        "this tool only creates NEW credentials and never overwrites an existing one.",
      missingPluginCard: ({ providerId }) => `No installed plugin declares a key card for '${providerId}'. Use credential_save with kind api instead.`,
      writeFailure: ({ message }) => `custom_credential_write_files: ${message}`,
      probeFailure: ({ status, keyHint, replacing }) => {
        const hint = keyHint ? ' This card needs: ' + keyHint : '';
        const kept = replacing ? ' The previous key was kept.' : '';
        return status === 'refused' ? `This key was refused for this purpose.${hint} Nothing was saved.${kept}`
          : `The service couldn't be reached. Nothing was saved.${kept}`;
      },
    };
}
