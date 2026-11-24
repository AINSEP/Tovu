/**
 * @file Express adapter for the admin `forms` routes: writes the status/body `@jini-ai/cms` maps a
 * forms/core error to (errors.spec.md §2/§6, `@jini-ai/cms/admin-http/http/forms-write-error`).
 * The mapping lives in the engine; this half stays with the host's routes because it writes to an
 * Express `Response`.
 */
import type { Response } from "express";
import { formsWriteErrorWire } from "@jini-ai/cms/admin-http/http/forms-write-error";

/**
 * Returns `true` once it has written a response (caller should stop); `false` for an unrecognized
 * error (caller falls through to its own generic 500).
 */
export function mapFormsWriteError({ err, res }: { err: unknown; res: Response }, _optional = {}): boolean {
  const wire = formsWriteErrorWire({ err });
  if (!wire) return false;
  res.status(wire.status).json(wire.body);
  return true;
}
