/**
 * @file Client-minted ids that only need to be unique — placement ids, run ids, idempotency keys.
 * None of them is a secret or gates access. A leaf module with no imports, so any module can use it
 * without an import cycle.
 */

let fallbackSequence = 0;

/** `crypto.randomUUID()` where the browser offers it (secure contexts only), else `<ms>-<suffix>`:
 *  64 random bits from `crypto.getRandomValues` (offered in insecure contexts too) or, with no Web
 *  Crypto at all, a per-page sequence number that keeps ids from colliding within this page. */
export function uniqueId(): string {
  const webCrypto: Partial<Crypto> | undefined = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  return `${Date.now()}-${fallbackSuffix(webCrypto)}`;
}

function fallbackSuffix(webCrypto: Partial<Crypto> | undefined): string {
  if (typeof webCrypto?.getRandomValues === "function") {
    const words = webCrypto.getRandomValues(new Uint32Array(2));
    return words[0]!.toString(36) + words[1]!.toString(36);
  }
  fallbackSequence += 1;
  return fallbackSequence.toString(36);
}
