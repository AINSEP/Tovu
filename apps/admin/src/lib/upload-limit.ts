import { t as translate } from "./upload-limit-i18n";

/**
 * @file The admin's ONE per-file upload limit and the words that refuse a file over it (P10-M2,
 * 2026-11-23). Library, Media and the chat composer all check against this, so a file one screen
 * takes is never refused by another. The server stays the authority: it mirrors
 * `@jini-ai/cms/media`'s `MAX_DOCUMENT_BYTES`, which `apps/website` imports as
 * `TOVU_MAX_UPLOAD_BYTES`. `apps/admin` is a separate browser bundle that cannot import that
 * server subpath, so the number is a hand-kept copy — change both together.
 */

/** 50 MiB. Said as "50 MB" to the operator, the same reading chat's `formatByteLimit` gives. */
export const ADMIN_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** English refusal, also its i18n key. It names the limit and the way forward (a smaller file, or
 *  asking the assistant to convert it), because "too large" alone leaves the operator stuck. */
export const UPLOAD_TOO_LARGE_MESSAGE = "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.";

/** Whether a picked file is over the limit. Exactly 50 MiB is allowed, matching the server. */
export function isUploadTooLarge({ size }: { size: number }, _optional: Record<string, never> = {}): boolean {
  return size > ADMIN_UPLOAD_MAX_BYTES;
}

/** The refusal in the viewer's language (English when the locale has no entry). */
export function uploadTooLargeMessage({ locale }: { locale: string }, _optional: Record<string, never> = {}): string {
  return translate({ locale, key: UPLOAD_TOO_LARGE_MESSAGE });
}
