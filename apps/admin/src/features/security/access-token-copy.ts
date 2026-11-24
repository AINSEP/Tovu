import type { AccessTokenProviderCopy } from "@jini-ai/admin/security/access-token-providers";
import { ACCESS_TOKEN_CATEGORIES } from "./rules";

/** The host's product copy for the Access Tokens provider list, handed to the generic provider-info
 *  logic in `@jini-ai/admin/security/access-token-providers`. Both purpose subtitles equal the
 *  category chip labels in `rules.ts`'s `ACCESS_TOKEN_CATEGORIES` letter for letter, so a row's
 *  subtitle and the chip that filters it always agree (the owner's 2026-09-21 ruling). */
export const ACCESS_TOKEN_PROVIDER_COPY: AccessTokenProviderCopy = {
  categories: ACCESS_TOKEN_CATEGORIES,
  publishPurposeLabel: "Hosting",
  sourceControlPurposeLabel: "Source control",
  customScopeGuidanceKey: "Paste the access token this provider issued from its own dashboard.",
  customCredentialSubtitleKey: "Custom credential",
};

/** `ProviderGroup`'s own `agentHandle` label (`AccessTokensTab.tsx`) — house rule: no functions in
 *  a `.tsx` component; a pure formatter with no hook state lives beside the copy, not in a hook. */
export function providerGroupHandleLabel({ info, connectedCount }: { info: { label: string }; connectedCount: number }, _options = {}): string {
  return `${info.label}'s saved access tokens — ${connectedCount} connected`;
}

/** `TokenRow`'s own `agentHandle` label (`AccessTokensTab.tsx`) — see {@link providerGroupHandleLabel}
 *  for why this lives here rather than in the component. */
export function tokenRowHandleLabel({ name, providerLabel }: { name: string; providerLabel: string }, _options = {}): string {
  return `${name} — ${providerLabel}, connected`;
}
