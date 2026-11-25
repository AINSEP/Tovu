/**
 * Why: the owner wants ONE upload limit for the whole site (2026-10-29: "one consistent size limit
 * across Library, Media, chat attachments and assistant imports"). `apps/admin` is a browser bundle
 * that cannot import website server code, so the number lives here, where both sides can read it.
 * The server enforces Jini's `MAX_DOCUMENT_BYTES`; `apps/website/src/features/media/__tests__/
 * upload-limit-single-source.test.ts` fails if that value and this one ever differ.
 */

/** The largest single file any surface accepts (Library, Media, chat attachments, assistant imports): 50 MiB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The most one chat message may carry in total: two files at the limit. */
export const MAX_UPLOAD_BATCH_BYTES = MAX_UPLOAD_BYTES * 2;
