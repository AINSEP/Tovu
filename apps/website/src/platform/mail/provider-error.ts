/** Provider diagnostics cross the host boundary only after Jini's secret scrubber, then a cap.
 * Exact credential values are supplied where available; redaction precedes truncation so a token
 * crossing the length boundary cannot leave a readable prefix. Mail also masks URL token parameters
 * (including fragments) through Jini's caller-owned patterns.
 * @complexity O(n) in diagnostic text for a bounded set of credential values; output <= 1000 chars.
 */
export { safeMailProviderText, credentialSecrets } from "@jini-ai/platform/mail";
