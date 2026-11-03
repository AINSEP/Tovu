import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

/** Export/import diagnostics contain locations and classifications, never matched values. */
export interface CredentialWarning { readonly path: string; readonly kind: string }

const MATCH_KINDS: Readonly<Record<string, string>> = {
  private_key: "private key", labeled_secret: "labeled secret", auth_header: "authorization header",
  high_entropy: "high entropy secret", escaped_secret: "escaped secret",
  bearer_token: "bearer token", url_credentials: "URL credentials", jwt: "JSON web token",
};

/** Adapt the existing redaction owner's classifications to CMS archive warnings without altering
 * content. Only fixed kind labels and a redacted location leave this boundary.
 * @complexity O(text bytes + accumulated warnings); duplicate table/column warnings coalesce.
 */
export function warnCredentialContent(required: { path: string; text: string; credentialWarnings: CredentialWarning[] }, optional: { codeAware?: boolean; vendorOnly?: boolean } = {}): void {
  const result = redactSecretShapes({ text: required.text }, optional);
  if (!result.redactions) return;
  // Read only the scanner's fixed replacement vocabulary; no matched text is ever returned.
  const original = new Map<string, number>();
  for (const match of required.text.matchAll(/\[REDACTED:[a-z_]+\]/g)) {
    original.set(match[0], (original.get(match[0]) ?? 0) + 1);
  }
  const kinds = new Set<string>();
  for (const match of result.text.matchAll(/\[REDACTED:([a-z_]+)\]/g)) {
    const count = original.get(match[0]) ?? 0;
    if (count > 0) { original.set(match[0], count - 1); continue; }
    kinds.add(MATCH_KINDS[match[1]!] ?? "provider key shape");
  }
  // A replacement can absorb an existing tag. Still warn even if no new marker survives.
  if (!kinds.size) kinds.add("credential-looking content");
  for (const kind of kinds) addCredentialWarning({ ...required, kind });
}

/** Deduplicate by safe shown location/kind. Values embedded in a filename are redacted too.
 * Mutates only the operation-local warning sink; O(path bytes + accumulated warnings).
 */
export function addCredentialWarning(required: { path: string; kind: string; credentialWarnings: CredentialWarning[] }, _options = {}): void {
  const path = redactSecretShapes({ text: required.path }).text.replace(/[\p{Cc}\p{Cf}]/gu, "");
  if (!required.credentialWarnings.some(warning => warning.path === path && warning.kind === required.kind)) {
    required.credentialWarnings.push({ path, kind: required.kind });
  }
}
