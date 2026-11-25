import { createShareHosting } from "@jini-ai/devops/backup/site/share-hosting";
import { peerUrl } from "@jini-ai/cms/publish/content/peer-url";
import { callPeer } from "../publish-content/peer-transport-binding.js";
import { SHARE_TOKEN_PATTERN, type SiteShareRegistry } from "./share-registry.js";
import { receiveSiteShareArtifact } from "./share-service.js";

/** @file Binds Jini's share hosting to this host's peer transport, share-file naming and provider id. */

/** This host's share delivery constructors and selection. `.tovu.zip` is the stem of every artifact this host names,
 * `tovu-server` the provider id already saved on existing share rows, and `TOVU_SHARE_PUBLIC_ORIGIN` the operator setting. */
export const { createRuntimeShareDelivery, createPeerShareDelivery, resolveShareDelivery } = createShareHosting<SiteShareRegistry, Parameters<typeof callPeer>[0]["deps"]>({
  callPeer,
  peerUrl,
  receiveArtifact: receiveSiteShareArtifact,
  tokenPattern: SHARE_TOKEN_PATTERN,
  artifactFilePattern: "[a-z0-9][a-z0-9-]{0,79}\\.tovu\\.zip",
  serverProvider: "tovu-server",
  publicOriginSetting: "TOVU_SHARE_PUBLIC_ORIGIN",
});
