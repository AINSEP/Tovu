import { bindMediaPublishContributor } from "@jini-ai/cms/media/site/publish-content";
import { createHostBlobWriteBindings } from "@jini-ai/cms/media/site/blob-write-bindings";
import { UPLOAD_CAPS } from "@tovu/contracts/upload-limits";

export const { contributeMediaPublish } = bindMediaPublishContributor({ createBlobWriteBindings: createHostBlobWriteBindings, uploadCaps: UPLOAD_CAPS });
