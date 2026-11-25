import { createPullAndStageFromPeer, type PublishContentPullDeps as PeerPullDeps } from "@jini-ai/cms/publish/content/pull";
import { resolvePublishDestinationCredential, type PublishDestinationCredentialDeps } from "./destination-credential.js";
import { pullBlobsFromPeer, pullBundleFromPeer } from "./peer-transport-binding.js";

/** Ports shared by the HTTP pull route and assistant tools. Credentials come only from saved peers. */
export interface PublishContentPullDeps extends PeerPullDeps {
  publishContentPeerRepo: PublishDestinationCredentialDeps["repo"];
  publishContentPeerHttpClient: PublishDestinationCredentialDeps["httpClient"];
  siteAssistantSecretSealer: PublishDestinationCredentialDeps["sealer"];
  siteAssistantSecretKeyring: PublishDestinationCredentialDeps["keyring"];
}

/**
 * @file Host binding for `@jini-ai/cms`'s pull-and-stage operation: supplies the host's credential
 * resolver (handshake, sealed-key opener and refusal wording, see `destination-credential.ts`) and
 * its bound outbound peer transport (`peer-transport-binding.ts`). The staging order and the
 * workspace/principal rules live in the package.
 */
export const pullAndStageFromPeer = createPullAndStageFromPeer<PublishContentPullDeps>({
  host: {
    resolveCredential: ({ deps, input }) => resolvePublishDestinationCredential({ deps: {
      repo: deps.publishContentPeerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      httpClient: deps.publishContentPeerHttpClient,
    }, input }),
    pullBundleFromPeer,
    pullBlobsFromPeer,
  },
});
