import { computeBlobStorageKey } from "@jini-ai/cms/media";
import { stageBundle, type StageBundleDeps } from "./bundle-staging.js";
import { resolvePublishDestinationCredential, type PublishDestinationCredentialDeps } from "./destination-credential.js";
import { pullBlobsFromPeer, pullBundleFromPeer } from "./peer-transport.js";

/** Ports shared by the HTTP pull route and assistant tools. Credentials come only from saved peers. */
export interface PublishContentPullDeps {
  workspaceId: string;
  clock: StageBundleDeps["clock"];
  idGen: StageBundleDeps["idGen"];
  publishContentBundleRepo: StageBundleDeps["repo"];
  publishContentPeerRepo: PublishDestinationCredentialDeps["repo"];
  publishContentPeerHttpClient: PublishDestinationCredentialDeps["httpClient"];
  siteAssistantSecretSealer: PublishDestinationCredentialDeps["sealer"];
  siteAssistantSecretKeyring: PublishDestinationCredentialDeps["keyring"];
  blobStore: Parameters<typeof pullBlobsFromPeer>[0]["blobSink"];
}

export interface StagedPeerPull {
  peerId: string;
  peerLabel: string;
  bundleId: string;
  expiresAt: string;
  entityCount: number;
  blobManifest: readonly string[];
  blobsDownloaded: readonly string[];
  blobsAlreadyPresent: readonly string[];
  blobsUnavailable: readonly string[];
  blobsDeferred: readonly string[];
}

/**
 * Fetches a saved peer's content and verified blobs, then stages it locally for the import gateway.
 * The authenticated caller owns the staged bundle; peer-declared identities are never trusted.
 * Blobs precede staging so a corrupt response cannot leave a staged bundle. Already verified blobs
 * may remain after a later failure, as ordinary content-addressed objects managed by blob GC.
 * @returns The existing HTTP pull response. No content entities are applied.
 * @throws Typed credential, transport or staging errors; callers handle their own boundary mapping.
 * @complexity O(e + b) space/work for entities and blobs; downloads retain the transport's cap.
 * @example await pullAndStageFromPeer(deps, { peerId: "live", principalId: "owner" });
 */
export async function pullAndStageFromPeer(
  deps: PublishContentPullDeps,
  input: { peerId: string; principalId: string },
): Promise<StagedPeerPull> {
  const credential = await resolvePublishDestinationCredential({
    repo: deps.publishContentPeerRepo,
    sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring,
    httpClient: deps.publishContentPeerHttpClient,
  }, { workspaceId: deps.workspaceId, id: input.peerId });
  const peer = { credential, httpClient: deps.publishContentPeerHttpClient };
  const envelope = await pullBundleFromPeer(peer);
  // Fetch blobs before staging: planImport blocks rows with missing local bytes, so bytes arriving
  // after planning would make the plan stale immediately. A hash mismatch aborts without staging.
  // Use this instance's workspace for local storage; the peer's workspace belongs only in its URL.
  const blobs = await pullBlobsFromPeer({
    ...peer,
    blobSink: deps.blobStore,
    workspaceId: deps.workspaceId,
    computeStorageKey: sha256 => computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256 }),
  }, { blobManifest: envelope.blobManifest });
  const staged = await stageBundle({
    // The common staging path computes expiry server-side and binds baselines to the authenticated
    // principal. A peer-declared identity must never claim another operator's sync memory.
    workspaceId: deps.workspaceId,
    sourcePrincipalId: input.principalId,
    artifactFormatVersion: envelope.artifactFormatVersion,
    hashVersion: envelope.hashVersion,
    sourceLabel: envelope.sourceLabel,
    entities: envelope.entities,
    blobManifest: envelope.blobManifest,
  }, { repo: deps.publishContentBundleRepo, clock: deps.clock, idGen: deps.idGen });
  return {
    peerId: credential.id,
    peerLabel: credential.label,
    ...staged,
    entityCount: envelope.entities.length,
    blobManifest: envelope.blobManifest,
    blobsDownloaded: blobs.downloaded,
    blobsAlreadyPresent: blobs.alreadyPresent,
    // Missing peer bytes are reported so the local plan blocks dependent rows, matching push's
    // fail-closed outcome. Over-cap blobs are deferred rather than lost; another pull fetches them.
    blobsUnavailable: blobs.unavailable,
    blobsDeferred: blobs.deferredOverCap,
  };
}
