import { createSiteShareService } from "@jini-ai/devops/backup/site/share-service";
import { SHARE_FILE } from "./share-registry.js";
import { SHARE_EXPIRY_HOST, SHARE_OWN_FOLDER_PROVIDER } from "./share-expiry.js";

/** The share service bound to this host's public file shape, `.tovu.zip` artifact suffix and own-folder provider id, plus its expiry policy. */
export const { receiveSiteShareArtifact, createSiteShare, revokeSiteShare, acknowledgeSiteShare, isOwnShareFolder, shareExpiredMessage } = createSiteShareService({
  host: { shareFile: SHARE_FILE, artifactSuffix: ".tovu.zip", ownFolderProvider: SHARE_OWN_FOLDER_PROVIDER, expiry: SHARE_EXPIRY_HOST },
});
