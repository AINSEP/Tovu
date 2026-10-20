import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";

import { allowedOriginsFor, resolveCustomCredentialByLabel, type CustomCredentialSetRepoPort } from "../custom-credentials/index.js";
import type { DeclaredApiConnection } from "./contribution.js";

/**
 * @file Bring-your-own OAuth client: a workspace admin's own client id + secret for a plugin
 * connection that declares `byoClient: true`, saved through the EXISTING secure credential capture
 * (Admin -> Access Tokens -> "Add custom provider", or the in-chat `custom_credential_create` card),
 * so the secret is typed into a masked field, sealed in the vault, and never passes through chat or
 * a tool argument. The saved custom credential is found by a label the host derives from the plugin
 * and connection ids ({@link byoClientLabel}); its username holds the client id (not a secret) and
 * its token the client secret. Its base URL must be on the connection's token endpoint origin: a
 * custom credential's allowed origins are where its secret may be sent, and the token endpoint is
 * the only place a client secret goes.
 *
 * Why a saved credential that is present but unusable is an error rather than "no BYO": the admin
 * chose their own client, so silently signing in with the Tovu-owned one instead would bind the
 * account to a client they did not pick.
 */

/** A usable BYO client. Kept server-side only; the secret is sent to the token endpoint and nowhere else. */
export interface ByoClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** What opening a saved custom credential needs (the site's vault repo, sealer and keyring). */
export interface ByoClientCredentials {
  readonly repo: CustomCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}

/** The custom-credential label an admin saves a connection's own OAuth client under. @complexity O(1). */
export function byoClientLabel(required: { readonly pluginId: string; readonly connectionId: string }, _optional: Record<string, never> = {}): string {
  return `${required.pluginId}/${required.connectionId} OAuth client`;
}

function unusable(connection: DeclaredApiConnection, label: string, problem: string): ApiConnectionError {
  return new ApiConnectionError({ code: "descriptor-invalid", message: `${connection.descriptor.label} cannot use your own OAuth client: the saved credential "${label}" ${problem}. Edit it under Admin > Access Tokens, then retry.` });
}

/**
 * The connection's BYO client in this workspace: undefined when the connection does not allow one
 * or none is saved; an error (never the secret) when the saved credential cannot be used.
 * @complexity O(n) custom credentials of the workspace (metadata), plus one envelope open.
 */
export async function resolveByoClient(
  required: { readonly credentials: ByoClientCredentials; readonly workspaceId: string; readonly connection: DeclaredApiConnection },
  _optional: Record<string, never> = {},
): Promise<ByoClient | ApiConnectionError | undefined> {
  const { connection } = required;
  if (!connection.byoClient) return undefined;
  const label = byoClientLabel({ pluginId: connection.pluginId, connectionId: connection.descriptor.connectionId });
  const saved = await resolveCustomCredentialByLabel(required.credentials, { workspaceId: required.workspaceId, label })
    .catch(() => unusable(connection, label, "could not be read on this site"));
  if (saved === null || saved instanceof ApiConnectionError) return saved ?? undefined;
  const tokenOrigin = new URL(connection.descriptor.tokenEndpoint).origin;
  if (!allowedOriginsFor(saved).includes(tokenOrigin)) return unusable(connection, label, `has the wrong base URL: its base URL must be on ${tokenOrigin}`);
  const clientId = saved.connection.username?.trim();
  if (!clientId) return unusable(connection, label, "has no client ID: save the OAuth client ID as its username");
  return { clientId, clientSecret: saved.connection.token };
}
