/**
 * Known secret-shaped patterns for `check-openapi-secret-leaks.ts` to scan real HTTP response
 * bodies against.
 *
 * Tovu has no existing `redactSecrets`-style pattern catalog to reuse — `grep -rn redactSecrets
 * src/` (2026-08-23) only turns up a doc-comment in `src/assistant/live-model-cache.ts` that
 * NAMES the concept, not an implementation; Jini's `SEC-005` (referenced in `db-ops.ts` /
 * `delegated-tools.ts`) is a different concern — "never let a raw internal exception reach the
 * wire," not "scan for credential-shaped strings." So this catalog is new for Tovu, built from
 * the same secret-shape categories gitleaks/trufflehog/GitHub secret scanning use (vendor key
 * prefixes, PEM blocks, password-hash formats, JWTs), rather than an arbitrary invented list.
 *
 * Deliberately prefix/structure-anchored, NOT "any long random string" — Tovu response bodies are
 * full of legitimate long opaque strings (UUIDs, entry ids, session-adjacent ids) that must never
 * false-positive here. `GENERIC_SECRET_FIELD` is the one heuristic pattern and is scoped to an
 * exact JSON key name specifically chosen to exclude Tovu's own real "safe by design" field names
 * (`apiKeyConfigured`, `apiKeyTail` — see `openapi/021-media-assets.yaml`'s
 * `MediaProviderCredentialView`) by construction: those keys don't match `"apiKey"` as an exact
 * quoted JSON key.
 */
export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "AWS Access Key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "AWS-style secret access key (assigned)", pattern: /aws_secret_access_key["']?\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/i },
  { name: "Stripe-style secret key", pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "Anthropic-style key", pattern: /\bsk-ant-[A-Za-z0-9-]{20,}\b/ },
  { name: "xAI-style key", pattern: /\bxai-[A-Za-z0-9]{16,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "JWT", pattern: /\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: "PEM private key block", pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "bcrypt hash", pattern: /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{53}/ },
  { name: "argon2 hash", pattern: /\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+/ },
  // Tovu's own two secret shapes (SPEC-006 REQ-08, added 2026-08-24 with the api-keys feature).
  // A raw key is legitimately returned by exactly ONE response — `issue_api_key`'s 201 — and by
  // nothing else ever; the stored digest should never appear in a body at all. Both are structure-
  // anchored on their literal prefixes, so neither can match an ordinary opaque Tovu id.
  { name: "Tovu API key (raw)", pattern: /\btovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]{20,}/ },
  { name: "scrypt hash", pattern: /\bscrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_+/-]+\$[A-Za-z0-9_+/-]+/ },
  {
    name: "generic secret-shaped JSON field",
    pattern: /"(?:apiKey|api_key|secretKey|clientSecret|accessToken|refreshToken|privateKey|passwordHash|password_hash)"\s*:\s*"[^"]{8,}"/,
  },
];

export interface SecretMatch {
  readonly patternName: string;
  readonly matchedText: string;
}

/** Returns every distinct pattern that matched, with the FIRST matched substring for each (a
 *  snippet for the report — never the full body, to avoid re-printing a real secret at length). */
export function scanForSecrets(body: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const found = body.match(pattern);
    if (found) matches.push({ patternName: name, matchedText: found[0] });
  }
  return matches;
}
