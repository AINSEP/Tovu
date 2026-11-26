/**
 * @file The first owner's password for a site that has no owner yet (G7-1, owner decision).
 *
 * Desktop creation supplies a random per-site password over stdin, signs in through a boot token,
 * and lets the owner choose a password under Users (Q2, replacing B213). A server site must be
 * given its own password at setup because it is reachable by strangers from its first boot.
 * Tovu has no first-run setup screen, so the setup step is the existing `TOVU_ADMIN_PASSWORD`
 * variable, and a missing/default/blank/weak value fails closed with instructions instead.
 *
 * Call this ONLY when an owner is actually about to be seeded: an existing deployment whose owner
 * already changed the password in Admin may legitimately leave `TOVU_ADMIN_PASSWORD` unset, and the
 * owner rule is "no readiness boot refusals" for an already-set-up site.
 */
import { validatePasswordPolicy } from "@jini-ai/user-management/server";
import { resolveApiConnectionRuntime, resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { DEFAULT_OWNER_PASSWORD } from "#src/platform/site-dir/index";

type Env = Readonly<Record<string, string | undefined>>;

const SET_PASSWORD_HELP =
  "Set the TOVU_ADMIN_PASSWORD environment variable to a password of your own choosing, then start the server again. " +
  "You sign in to Admin as the owner with that password. The built-in starter password is only used by the desktop app.";

/** Thrown instead of seeding a server site's owner with a password anyone could know. Never carries the password. */
export class FirstOwnerPasswordRequiredError extends Error {
  constructor({ reason }: { reason: string }, _optional = {}) {
    super(`ERR-OWNER-PASSWORD-REQUIRED: This site is running as a server and has no owner yet. ${reason} ${SET_PASSWORD_HELP}`);
    this.name = "FirstOwnerPasswordRequiredError";
  }
}

/**
 * A server site = an explicit production runtime (`TOVU_RUNTIME_MODE=production`, the deploy signal
 * the readiness gate already keys on) that is not the desktop shell. Local dev and tests stay local.
 * @complexity O(1).
 */
export function isServerSite({ env }: { env: Env }, _optional = {}): boolean {
  return resolveRuntimeMode({ env }) === "production" && resolveApiConnectionRuntime({ env }) === "hosted";
}

/**
 * The password to seed the first owner with. Desktop creation supplies its private password;
 * local development retains `TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD`.
 * Server: the operator's own password, or {@link FirstOwnerPasswordRequiredError}.
 * @throws {FirstOwnerPasswordRequiredError} server site with an unset, blank, default, or policy-rejected password.
 * @complexity O(n) in the password's length.
 */
export function resolveFirstOwnerPassword({ env }: { env: Env }, _optional = {}): string {
  const configured = env.TOVU_ADMIN_PASSWORD;
  if (!isServerSite({ env })) return configured ?? DEFAULT_OWNER_PASSWORD;
  if (configured === undefined || configured.trim() === "") {
    throw new FirstOwnerPasswordRequiredError({ reason: "No owner password was set." });
  }
  if (configured === DEFAULT_OWNER_PASSWORD) {
    throw new FirstOwnerPasswordRequiredError({ reason: "The owner password is still the public starter password." });
  }
  const policyError = validatePasswordPolicy({ password: configured });
  if (policyError !== null) throw new FirstOwnerPasswordRequiredError({ reason: `The owner password was rejected: ${policyError}` });
  return configured;
}
