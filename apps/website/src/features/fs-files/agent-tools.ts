import { getFsFilesAgentToolCatalog as catalogWithPorts } from '@jini-ai/cms/fs-files/agent-tools';
import { MAX_FS_FILE_BYTES } from './fs-files.js';
import { FS_ROOT_DESCRIPTORS, FS_ROOT_IDS } from './layout.js';

export const FS_FILES_READ_PERMISSION = "content.read";

export function getFsFilesAgentToolCatalog() {
  return catalogWithPorts({ FS_ROOT_IDS, FS_ROOT_DESCRIPTORS, MAX_FS_FILE_BYTES, FS_FILES_READ_PERMISSION });
}
