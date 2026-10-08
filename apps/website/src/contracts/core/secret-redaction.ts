// Jini implementation: packages/diagnostics/src/redaction/secrets-only.ts
// Shared-vocabulary/CLI-isolation rationale: Jini/packages/core/src/redact.ts.
import {
  redactSecretShapes as redactDiagnosticSecrets,
  type RedactionPolicy,
  type SecretRedaction,
} from "@jini-ai/diagnostics/redaction/secrets-only";

/** Tovu application keys retain their public key ID while hiding only the secret half. */
const TOVU_SECRET_POLICY: RedactionPolicy = {
  additionalRules: [{
    kind: "tovu_api_key",
    pattern: /(tovu_ak_[0-9a-f]{12}\.)[A-Za-z0-9_-]{20,}/g,
    replacement: ({ match }) => `${match[1]}[REDACTED:tovu_api_key]`,
  }],
};

/**
 * Applies Jini's secret-only rules with Tovu's application-key policy. Pure; no logging or I/O.
 * @param required Arbitrary error or evidence text.
 * @returns Redacted text and replacement count; paths, addresses and ordinary prose remain visible.
 * @complexity O(r*n) time and O(n) space for n characters and the fixed rule count r.
 * @example redactSecretShapes({ text: "password=hunter2hunter2" });
 *
 * Blanks secret-shaped VALUES out of arbitrary error text, without touching anything else in
 * it. The owner requires "secrets only": failures stay visible wherever they already reach,
 * but secret-shaped values never do.
 *
 * ## Reuse, don't duplicate
 * The vendor-credential rules Tovu already trusts as "real credential shape" — Google `AIza`,
 * Anthropic `sk-ant-`, OpenAI `sk-`, GitHub `ghp_`/`gho_`/`github_pat_`, npm, Slack, AWS `AKIA`,
 * Fastmail, PEM header — now live in Jini core `SECRET_SHAPE_PATTERNS` (`packages/core/src/redact.ts`)
 * and are folded into diagnostics `REDACTION_RULES`
 * under the `credential` kind. A vendor added there later is redacted here automatically, with no
 * duplicate list to keep in sync.
 *
 * ## Must NOT change (asserted by Tovu's secret-redaction unit tests)
 * Tool ids, `CODE: message` prefixes, absolute file paths, IPv4/IPv6/hostnames, emails, plain
 * numbers and timestamps, ordinary prose such as `password: must be at least 8 characters`, and the
 * error ID itself.
 *
 * ## Why IPs and paths are untouched
 * IPs: the owner's question about IP handling is parked — nothing here touches them, and
 * diagnostics' `url_credentials` rule keeps the host it sits beside. Paths: a path is
 * not a secret, and the owner's ruling was "secrets only" — an absolute path (e.g. the site-key
 * file's location) stays visible because it is useful for debugging and the key's bytes never
 * appear in an error.
 *
 * Pure: no I/O, no logging, no shared state. Every rule is global and idempotent — each carries a
 * `(?!\[REDACTED)` guard (or, for the PEM/credential rules, simply cannot re-match its own already
 * -redacted output) so running this function twice on its own output is a no-op.
 */
export function redactSecretShapes({ text }: { text: string }): SecretRedaction {
  return redactDiagnosticSecrets({ text, policy: TOVU_SECRET_POLICY });
}
