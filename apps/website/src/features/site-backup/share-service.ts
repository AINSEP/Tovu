import { createSiteShareService } from "@jini-ai/devops/backup/site/share-service";
import { SHARE_FILE } from "./share-registry.js";

/** The share service bound to this host's public file shape, `.tovu.zip` artifact suffix and own-folder provider id. */
export const { receiveSiteShareArtifact, createSiteShare, revokeSiteShare, acknowledgeSiteShare, isOwnShareFolder } = createSiteShareService({
  host: { shareFile: SHARE_FILE, artifactSuffix: ".tovu.zip", ownFolderProvider: "tovu-server" },
});
