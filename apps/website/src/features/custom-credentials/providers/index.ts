import { flyIoAuthSchemeProvider } from "./fly-io.js";
import type { CustomCredentialAuthSchemeProvider, SelfDescribingTokenMatch } from "./types.js";

export type { CustomCredentialAuthSchemeProvider, SelfDescribingTokenMatch } from "./types.js";

/**
 * @file The custom-credentials self-describing-token-scheme registry — the per-vendor extension
 * point `credentialed-request.ts`'s `resolveAuthorizationScheme` calls out to, instead of growing an
 * inline allow-list of scheme words inside that shared file.
 *
 * (2026-09-03 redesign.) The first cut of the fly.io fix special-cased `"FlyV1"` directly inside
 * `credentialed-request.ts` — a single constant and a couple of functions living in the shared
 * request-building file. That does not scale: every future vendor with the same "my token embeds
 * its own scheme" quirk would mean editing that shared file and growing a shared conditional list a
 * new vendor has no reason to know exists. This registry moves each vendor's own recognizer into its
 * own file (`./fly-io.ts`, and later others): a NEW vendor plugs in by adding one file (its own
 * `detect(token)` implementing {@link CustomCredentialAuthSchemeProvider}, with its own evidentiary
 * doc comment — see `fly-io.ts`'s header for the shape) and one line in
 * {@link CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS} below. `credentialed-request.ts` itself never
 * changes again for a new vendor — it only ever calls {@link detectSelfDescribingAuthScheme}.
 *
 * **Dispatch is TRY-EACH-IN-TURN** (`detect()` on every registered provider in order, first match
 * wins), not keyed off the credential's own saved host/base URL. This is a deliberate departure from
 * this codebase's other per-vendor precedent, `features/deployments/providers/`: that registry
 * dispatches by an EXPLICIT, stored `DeploymentTargetRecord.providerId` — a fixed catalog id the
 * operator chooses when the deployment target is created (`features/deployments/types.ts`). That
 * shape does not transfer here: `custom_credential_sets` has no equivalent column.
 * `features/custom-credentials/types.ts`'s own header documents this table has "no fixed provider
 * identity at all" — an operator supplies only a free-typed `label`, `baseUrl`, and `token`, with no
 * provider-id field a lookup could key on. Host-based dispatch was considered instead of
 * try-each-in-turn and rejected for two reasons: (1) it would require threading `baseUrl`/
 * `additionalHosts` into `buildAuthorizationHeader`, which today takes only the connection
 * (`token`/`username`) — a larger, more invasive signature change than this fix needs — and (2) it
 * is less faithful to the actual evidence. The whole reason this is called a SELF-describing scheme
 * is that the token identifies its own format without needing any other saved metadata; a fly.io
 * credential saved with a non-standard/proxied `baseUrl` would still carry a real `FlyV1`-prefixed
 * token and should still be recognized correctly. Recognition-by-token-content generalizes to that
 * case; host-string matching would not, and would silently stop working the moment a credential's
 * saved host diverges even slightly from the exact strings a host-keyed map expects.
 *
 * `features/deployments/providers/` DID stay a useful precedent for the structural shape adopted
 * here: one small port interface (`./types.ts`), one file per vendor implementing it, and a generic
 * caller that never special-cases a vendor by name. Only the DISPATCH mechanism differs, for the
 * data-model reason above.
 */

/** Every registered vendor recognizer, in dispatch order. Order only matters if two providers could
 *  ever both match the same token — not possible today with a single entry, but a future vendor
 *  registration should keep its own prefix disjoint from every other registered provider's, the same
 *  "narrow, explicit, and verified rather than guessed" discipline each individual recognizer
 *  already holds itself to. */
export const CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS: readonly CustomCredentialAuthSchemeProvider[] = [flyIoAuthSchemeProvider];

/**
 * Tries every registered provider's own recognizer in turn and returns the first match, or `null` if
 * none of them recognize `token` — the overwhelming majority of tokens, which fall through to
 * `credentialed-request.ts`'s own ordinary Bearer/Basic handling unchanged. See this file's header
 * for why dispatch is try-each-in-turn rather than keyed by host.
 *
 * @complexity O(p) in the small, fixed number of registered providers (currently 1).
 */
export function detectSelfDescribingAuthScheme(token: string): SelfDescribingTokenMatch | null {
  for (const provider of CUSTOM_CREDENTIAL_AUTH_SCHEME_PROVIDERS) {
    const match = provider.detect(token);
    if (match) return match;
  }
  return null;
}
