/**
 * @file STAYS-HOST: the host copy for a file refused for its size. The server sends a typed refusal
 * (`MEDIA_UPLOAD_TOO_LARGE` with `fileBytes`/`limitBytes`); this turns it into translated owner copy.
 */
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { ApiError } from "../../lib/admin-http/request";

/** The ordinary-limit refusal; its key is the English text, translated in `media-i18n.ts`. */
export const FILE_TOO_LARGE_COPY = "This file is larger than 50 MB. Choose a smaller file or ask the assistant to convert it.";

/** The refusal copy for a file over `limitBytes`. Only the ordinary limit gets the 50 MB copy; the larger
 *  video and batch ceilings keep their own message (`fallback`), since converting cannot help there.
 *  @complexity O(1). */
export function fileSizeRefusal(
  { t, limitBytes, fallback }: { t: (key: string) => string; limitBytes: number; fallback: string },
  _optional: Record<string, never> = {},
): string {
  return limitBytes === MAX_UPLOAD_BYTES ? t(FILE_TOO_LARGE_COPY) : fallback;
}

/** The size refusal copy for a server error, or `undefined` when it is not a typed size refusal
 *  (empty input, forbidden types and other validation failures keep their own messages). @complexity O(1). */
export function sizeRefusalFromError({ t, error }: { t: (key: string) => string; error: unknown }, _optional: Record<string, never> = {}): string | undefined {
  // Matched on the typed code and fields, never on the wording of the message.
  if (!(error instanceof ApiError) || error.code !== "MEDIA_UPLOAD_TOO_LARGE") return undefined;
  const limitBytes = error.body?.["limitBytes"];
  return typeof limitBytes === "number" ? fileSizeRefusal({ t, limitBytes, fallback: error.message }) : undefined;
}
