import { validatePasswordPolicy } from "@jini-ai/user-management/server";
import { DEFAULT_OWNER_PASSWORD } from "../../features/identity/wiring.js";
import { ValidationError } from "./errors.js";

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
