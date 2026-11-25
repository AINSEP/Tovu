import { computeBlobStorageKey, isDocumentOnlyBlob } from "@jini-ai/cms/media";
import { normalizeMode } from "@jini-ai/cms/publish/content/file-tree-policy";
import { createRawFileContributor } from "@jini-ai/cms/publish/content/raw-file-contributor";
import { BACKSTOP_LIMITS, BACKSTOP_RAW_POLICY } from "./backstop-policy.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";

/**
 * @file Host binding of the engine's raw-file ("send by hand") publish type. The engine owns the
 * pack/precheck/apply/undo mechanics; this module supplies only Tovu's values: the immutable
 * deny-list policy, the numeric limits, and the refusal copy that states those limits.
 */
export const { contributeRawFilePublish, undoRawFile } = createRawFileContributor<TovuPublishPorts>({
  policy: BACKSTOP_RAW_POLICY,
  limits: BACKSTOP_LIMITS,
  copy: { tooManyFiles: "Choose at most 50 files per send.", tooManyBytes: "Choose files totaling at most 50 MB per send." },
  normalizeMode,
  blobStorageKey: computeBlobStorageKey,
  // Missing media stores fail closed, exactly as before the move.
  isLibraryOnlyBlob: async ({ deps, workspaceId, sha256 }) => {
    const media = deps.ports.media;
    return !media || isDocumentOnlyBlob({ deps: { mediaRepo: media.repo, blobRepo: media.assetBlobRepo }, input: { workspaceId, sha256 } });
  },
});
