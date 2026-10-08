// Credential policy implementation: @jini-ai/platform/secrets/credential-token. Keep this binding while parallel
// credential-save work imports the existing path; it injects Tovu's application-key detector.
export { CREDENTIAL_TOKEN_LIMIT, CREDENTIAL_MESSAGES, CredentialInputError, assertCredentialToken,
  normalizeCredentialToken, credentialTokenHint } from "@jini-ai/platform/secrets/credential-token";
export type { CredentialMessageId, CredentialTokenHint, CredentialConnection } from "@jini-ai/platform/secrets/credential-token";
import { assertCredentialFreeField as assertPlatformCredentialFreeField } from "@jini-ai/platform/secrets/credential-token";
import { redactSecretShapes } from "./secret-redaction.js";
export function assertCredentialFreeField(required: { value: string; field: string }, optional = {}): void {
  assertPlatformCredentialFreeField({ ...required, containsSecret: ({ text }) => redactSecretShapes({ text }).redactions > 0 }, optional);
}
