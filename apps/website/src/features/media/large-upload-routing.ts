import type { ToolRegistration } from "@jini-ai/core";
import { MAX_DOCUMENT_BYTES as TOVU_MAX_UPLOAD_BYTES } from "@jini-ai/cms/media";

/**
 * @file A212 — routes an agent's large video to the local file import path.
 *
 * `media_upload_asset` takes the file's bytes inline (base64), and an agent's own upload channel —
 * e.g. a browser-driving agent's file-upload tool — caps out around 10 MB, so a typical demo video
 * had no agent route into the library even though the server accepts up to 50 MiB. The local file
 * import (`media_import_local_file`) already reads the bytes server-side from the site folder or the
 * owner-picked folder with the full cap and the same type/size checks; this only tells the agent, at
 * the moment it reaches for the inline upload, that the bigger route exists and how to use it.
 */

const UPLOAD_TOOL_ID = "media_upload_asset";
const LOCAL_IMPORT_TOOL_ID = "media_import_local_file";

/** The plain-words routing sentence, with the cap derived from the enforced constant so it cannot drift. */
export const LARGE_UPLOAD_ROUTING =
  `A video or other file too big to send inline here (anything over about 10 MB) goes through the local file import instead: ` +
  `save it in this site's folder or the folder the owner picked, find it with fs_list_files, then call ${LOCAL_IMPORT_TOOL_ID} ` +
  `with that root and path. That import accepts up to ${Math.round(TOVU_MAX_UPLOAD_BYTES / (1024 * 1024))} MiB and runs the same type and size checks.`;

/** Appends {@link LARGE_UPLOAD_ROUTING} to `media_upload_asset`'s description; every other registration is returned unchanged. @complexity O(1). */
export function withLargeUploadRouting(registration: ToolRegistration, _optional: Record<string, never> = {}): ToolRegistration {
  if (registration.descriptor.id !== UPLOAD_TOOL_ID) return registration;
  const description = [registration.descriptor.description, LARGE_UPLOAD_ROUTING].filter(Boolean).join(" ");
  return { ...registration, descriptor: { ...registration.descriptor, description } };
}
