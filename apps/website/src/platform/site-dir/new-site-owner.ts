import { validatePasswordPolicy } from "@jini-ai/user-management/server";
import { ValidationError } from "./errors.js";

/**
 * SPEC-022 §4.2 / `production-readiness-gate.ts` — the literal owner-password default this
 * module seeds when `TOVU_ADMIN_PASSWORD` is unset. Exported (not inlined below) so
 * `runBootGateOrExit()` in `src/index.ts` can compare the configured password against the exact
 * same value this seeder falls back to, with no second copy of the string to drift out of sync.
 */
export const DEFAULT_OWNER_PASSWORD = "tovu-dev";

/** New-site credentials belong to the creation request, never the serving process's environment.
 * Reuses Jini's write-time policy without changing deployed first-boot seeding.
 * @throws {ValidationError} malformed or policy-rejected input; never includes the password.
 * @complexity O(n) in the supplied password's length.
 */
export function resolveNewSiteAdminPassword(
  { adminPassword }: { adminPassword?: unknown },
  _options: Record<string, never> = {},
): string {
  if (adminPassword === undefined) return DEFAULT_OWNER_PASSWORD;
  if (typeof adminPassword !== "string") throw new ValidationError("Admin password must be a string.");
  const error = validatePasswordPolicy({ password: adminPassword });
  if (error !== null) throw new ValidationError(error);
  return adminPassword;
}
