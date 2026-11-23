/**
 * @file Express adapter for the admin `forms` routes still hand-written here: writes the forms/core
 * error -> HTTP mapping (errors.spec.md §2/§6). The mapping itself lives with the route specs in
 * `@jini-ai/cms/admin-http/routes/forms/write-error`; this wire half stays with the host's routes
 * because it writes to an Express `Response`.
 */
import type { Response } from "express";
import { formsWriteErrorAnswer } from "@jini-ai/cms/admin-http/routes/forms/write-error";

/**
 * Shared error -> HTTP mapping for every admin `forms` route (errors.spec.md §2/§6). Returns
 * `true` once it has written a response (caller should stop); `false` for an unrecognized error
 * (caller falls through to its own generic 500).
 */
export function mapFormsWriteError({ err, res }: { err: unknown; res: Response }, _optional = {}): boolean {
  const answer = formsWriteErrorAnswer({ err });
  if (!answer) return false;
  res.status(answer.status).json(answer.body);
  return true;
}
