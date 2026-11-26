import { bindMediaImportTools } from "@jini-ai/cms/media/site-import/bindings";
import { UPLOAD_CAPS, uploadLimitForFile } from "@tovu/contracts/upload-limits";
import { EgressRefusedError } from "#src/platform/http/index";
import { createConvertingUploader, createConvertingStagedUploader, type VideoImportOptions } from "../media/import-video-conversion.js";
import { resolveSiteFileRequest } from "../fs-files/site-file-request.js";
import { openFsFileForRead, withLocalStream } from "../fs-files/fs-files.js";
import { FsFilePathError } from "@jini-ai/platform/fs/guarded-reader";
import { FS_ROOT_IDS } from "../fs-files/layout.js";
import { FS_FOLDER_READ_RECOVERY } from "@tovu/contracts/fs-folder-recovery";
import { fetchImage, validateImageBytes } from "./fetch-image.js";
import { replaceMediaFile, sniffContentType } from "@jini-ai/cms/media";
import fsPromises from "node:fs/promises";
import { createStagedFileAdapter } from "@jini-ai/platform/fs";
import { siteTempRoot, SITE_TEMP_PREFIXES } from "#src/platform/temp/site-temp-roots";

const { withStagedFile } = createStagedFileAdapter({ filesystem: fsPromises,
  withTempRoot: siteTempRoot({ prefix: SITE_TEMP_PREFIXES.mediaVideo }), sniffContentType,
}, {});

export const {
  mediaImportAgentToolCatalog,
  resolveLocalImportRequest,
  isImportShapeRejection,
  withCallerSafeEgressRefusal,
  persistImportedMedia,
  buildMediaImportRegistrations,
  contributeMediaImportTools,
} = bindMediaImportTools<VideoImportOptions>({
  fsRootIds: FS_ROOT_IDS,
  recoveryText: FS_FOLDER_READ_RECOVERY,
  mediaAssetReadToolId: "content_read.media_asset",
  resolveSiteFileRequest,
  openFsFileForRead,
  withLocalStream,
  withStagedFile,
  uploadLimitForFile,
  uploadCaps: UPLOAD_CAPS,
  fetchImage,
  validateImageBytes,
  createConvertingUploader,
  createConvertingStagedUploader,
  replaceMediaFile,
  EgressRefusedError,
  isPathRefusal: ({ error }) => error instanceof FsFilePathError,
  logEgressRefusal: console.warn,
}, {});
