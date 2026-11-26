import * as folderZip from "@jini-ai/agent-plugins/folder-zip";
import { FolderZipError } from "@jini-ai/agent-plugins/core/folder-zip-error";
import type { FolderZipPort } from "@jini-ai/admin/shell/components/InstallTabCard/use-folder-upload.hooks";

/**
 * @file The folder zipper the Plugins and Agent Plugins "Choose a folder" buttons drive: the
 * `folder-zip` module's zipper and refusal keys, plus the refusal class it throws, which lives in
 * `core/folder-zip-error` (the `folder-zip` module does not re-export it).
 */

/** The host's {@link FolderZipPort}, built explicitly so a missing member is a type error, not a runtime `instanceof` TypeError. */
export const folderZipPort: FolderZipPort = { ...folderZip, FolderZipError };
