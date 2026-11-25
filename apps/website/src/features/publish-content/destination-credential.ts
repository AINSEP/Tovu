import { openPublishSession, PublishTrustHandshakeError } from "@jini-ai/cms/publish/trust/handshake-client";
import type { HttpClientPort } from "#src/platform/http/index";
import { PUBLISH_TRUST_WIRE } from "#src/features/publish-trust/host-settings";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/integrations/secrets";
import { resolvePublishDestinationCredential as resolveDestinationCredential } from "@jini-ai/cms/publish/content/destination-credential";

import { resolvePeerCredential, type PublishContentPeerRepoPort, type ResolvedPeerCredential } from "@jini-ai/cms/publish/content/peer-registry";

/**
 * @file Host binding for `@jini-ai/cms`'s destination-credential decision: supplies the host's
 * handshake client, its one decrypting function (`resolvePeerCredential`) and the wording and error
 * class of the "not the site this computer was connected to" refusal. The decision itself — sealed
 * row versus connected destination, and the workspace re-check — lives in the package.
 */

export interface PublishDestinationCredentialDeps {
  readonly repo: PublishContentPeerRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** The guarded egress client — the same one the push itself uses. */
  readonly httpClient: HttpClientPort;
}

/**
 * Resolves whatever credential a destination is due, for the lifetime of one outbound request, using
 * the host's handshake and sealed-key opener.
 *
 * @throws {PublishTrustHandshakeError} when the destination now reports a different workspace.
 * @complexity O(1) plus one repo read; then either one AEAD open, or three round trips and two HKDFs.
 */
export async function resolvePublishDestinationCredential(
  { deps, input }: { deps: PublishDestinationCredentialDeps; input: { workspaceId: string; id: string; backstop?: boolean } },
  // The handshake is a port so the workspace re-check is testable without three live round trips;
  // production always uses the real `openPublishSession`.
  { openSession = openPublishSession }: { openSession?: typeof openPublishSession } = {}
): Promise<ResolvedPeerCredential> {
  return resolveDestinationCredential({
    deps,
    input,
    resolveSealedCredential: ({ deps: d, input: i }) => resolvePeerCredential({ deps: { repo: d.repo, sealer: d.sealer }, input: i }),
    openSession: ({ deps: d, input: i }) => openSession({ deps: { httpClient: d.httpClient, protocol: PUBLISH_TRUST_WIRE, keyring: d.keyring }, input: i }),
    workspaceMismatchError: ({ label }) =>
      new PublishTrustHandshakeError({ message: `${label} is not the site this computer was connected to. Connect it again to confirm.`, failure: "refused" }),
  });
}
