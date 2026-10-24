import { redactSecrets } from "@jini-ai/core";

/** Provider diagnostics cross the host boundary only after Jini's secret scrubber, then a cap.
 * Exact credential values are supplied where available; redaction precedes truncation so a token
 * crossing the length boundary cannot leave a readable prefix. No vendor-specific parsing lives here.
 * @complexity O(n) in diagnostic text for a bounded set of credential values; output <= 1000 chars.
 */
export function safeMailProviderText(
  { text }: { text: string },
  { secrets = [] }: { secrets?: readonly string[] } = {},
): string {
  return redactSecrets({ input: text }, { exactSecrets: secrets, redactPii: false }).slice(0, 1000);
}

/** The credential's string values, so exact redaction also catches keys no pattern recognises.
 * @complexity O(k) credential fields.
 */
export function credentialSecrets({ credential }: { credential: object }, _options: Record<string, never> = {}): string[] {
  return Object.values(credential).filter((value): value is string => typeof value === "string");
}
