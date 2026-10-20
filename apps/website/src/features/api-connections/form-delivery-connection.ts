import type { FormDestinationCredential } from "../form-destinations/types.js";
import type { ApiConnectionHost } from "./host.js";

/**
 * @file The OAuth implementation of the form-delivery `FormDeliveryConnectionPort`: a push
 * destination's binding stores only a `connectionRef`; each delivery attempt resolves a fresh access
 * token here, immediately before its HTTP call. Jobs never hold tokens.
 *
 * UNWIRED until the forms fan-out lands (the form-delivery wiring lot): it is built against the
 * forms-multidest delivery contract and tested in isolation. The ref must belong to the plugin that contributes
 * the binding's adapter, so one plugin's destination can never spend another plugin's connection.
 *
 * A job freezes the account it was set up with (`expectedAccountId`): after a confirmed account
 * switch the same ref holds another account, and a frozen job is refused (`account-changed`) instead
 * of silently delivering there. `getAccessToken` reads a token per provider request so the
 * connection's request budgets count every request, not one per delivery.
 */

/**
 * A delivery credential plus the extra hosts the push kit may reach with it (hosts, like custom
 * credentials). `token` is this attempt's read (the contract's field); `getAccessToken` is one read
 * per provider request, on the same frozen account (its first call returns `token`).
 */
export type OAuthFormDeliveryCredential = FormDestinationCredential & {
  readonly additionalHosts: readonly string[];
  readonly getAccessToken: () => Promise<string>;
};

/** Contract shape from the forms-multidest brief; replaced by its exported type at G14. */
export type FormDeliveryConnectionPort = (
  required: { readonly workspaceId: string; readonly connectionRef: string; readonly adapterId: string },
  optional?: { readonly expectedAccountId?: string },
) => Promise<OAuthFormDeliveryCredential | null>;

/** Hands out the attempt's first token once, then a fresh read per call. @complexity O(1) per call. */
function perRequestTokens(first: string, read: () => Promise<string>): () => Promise<string> {
  let unused: string | undefined = first;
  return async () => {
    const token = unused;
    unused = undefined;
    return token ?? read();
  };
}

/**
 * @param required.hostFor - The workspace's API-connection host, or null when it has none.
 * @param required.adapterPluginId - Which plugin contributes a form-destination adapter id; null when none.
 * @param optional.expectedAccountId - The account the job froze; omitted only for a job that froze none.
 * @returns null for a ref this port does not own (so a composite port can try static credentials);
 *   otherwise the access token as the credential, with the connection's declared `apiOrigins` as
 *   `baseUrl` (the first) and `additionalHosts` (the rest). API-connection refusals (reconnect required,
 *   account changed, …) propagate with their safe message for the delivery's error mapping.
 * @complexity One contribution load plus one token read; each later request is one token read.
 */
export function createOAuthFormDeliveryConnectionPort(
  required: {
    readonly hostFor: (input: { readonly workspaceId: string }) => ApiConnectionHost | null;
    readonly adapterPluginId: (input: { readonly workspaceId: string; readonly adapterId: string }) => Promise<string | null>;
  },
  _optional: Record<string, never> = {},
): FormDeliveryConnectionPort {
  return async ({ workspaceId, connectionRef, adapterId }, optional = {}) => {
    const host = required.hostFor({ workspaceId });
    const pluginId = host ? await required.adapterPluginId({ workspaceId, adapterId }) : null;
    const declared = host && pluginId ? await host.declaredFor({ pluginId, connectionRef }) : undefined;
    if (!host || !pluginId || !declared) return null;
    const frozen = optional.expectedAccountId === undefined ? {} : { expectedAccountId: optional.expectedAccountId };
    const read = () => host.accessTokensFor({ pluginId }).getAccessToken({ connectionRef }, frozen);
    const token = await read();
    // The push kit allows the base URL's origin plus `additionalHosts`; an OAuth destination reaches
    // only the https origins its plugin declared on the connection (none declared: nothing allowed).
    const [baseUrl = "", ...rest] = declared.apiOrigins;
    return { token, baseUrl, additionalHosts: rest.map((origin) => new URL(origin).host), getAccessToken: perRequestTokens(token, read) };
  };
}
