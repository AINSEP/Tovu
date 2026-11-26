import { bindMediaPublishContributor } from "@jini-ai/cms/media/site/publish-content";
import { createHostBlobWriteBindings } from "@jini-ai/cms/media/site/blob-write-bindings";
import { UPLOAD_CAPS } from "@tovu/contracts/upload-limits";
import { isValidSha256Hex, bytesMatchSha256 } from "@jini-ai/cms/publish/transfer/blob-staging";
import { createHash } from "node:crypto";
import { createRepoPublishHandler } from "@jini-ai/cms/publish/content/repo-handler";

export const { contributeMediaPublish } = bindMediaPublishContributor({ createBlobWriteBindings: createHostBlobWriteBindings, uploadCaps: UPLOAD_CAPS,
  sha256: { isValidSha256Hex, bytesMatchSha256 }, createHash, createRepoPublishHandler });
