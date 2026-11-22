import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import { MediaValidationError } from "@jini-ai/cms/media";

/**
 * @file Request guards and failure responses shared by the admin media routes.
 *
 * Every media route opened with the same workspace check, and the write/read routes each carried
 * an identical 403 block and the same "validation is 400, anything else is a private 500" mapping.
 * Owning them once keeps those routes' status codes and bodies from drifting apart. The workspace
 * check and `readRouteParam` now live in `server/inbound/shared/route-guards.ts` and the 403 in
 * `authorize-guard.ts`'s `authorizeDirectOrRespond` (dedupe plan RG1/RG2), shared by every route.
 */

/** Writes the media routes' `404 media '<id>' was not found` body.
 *  @complexity O(1). */
export function sendMediaNotFound({ res, mediaId }: { res: Response; mediaId: string }): void {
  res.status(404).json({ error: `media '${mediaId}' was not found` });
}

/** A `MediaValidationError` is the caller's fault and its message is safe to return (400); anything
 *  else is an unexpected failure whose cause stays private, correlated by the copyable error ID.
 *  @complexity O(1). */
export function sendValidationOrInternalError({ res, error }: { res: Response; error: unknown }): void {
  if (error instanceof MediaValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  sendAdminFailure({ res, error }, { operation: "routes/media/route-guards", code: "INTERNAL_ERROR", message: "The media upload or change could not finish." });
}
