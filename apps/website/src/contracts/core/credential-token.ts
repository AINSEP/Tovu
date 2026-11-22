// Tovu's binding of the platform credential rule. Everything else in the credential policy lives in
// @jini-ai/platform/secrets/credential-token and is imported from there; this file exists only to inject
// Tovu's application-key detector into the platform's "no secrets in a plain field" check, so a secret-shaped
// value is refused the same way in every field that calls this one.
import { assertCredentialFreeField as assertPlatformCredentialFreeField } from "@jini-ai/platform/secrets/credential-token";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
export function assertCredentialFreeField(required: { value: string; field: string }, optional = {}): void {
  assertPlatformCredentialFreeField({ ...required, containsSecret: ({ text }) => redactSecretShapes({ text }).redactions > 0 }, optional);
}
