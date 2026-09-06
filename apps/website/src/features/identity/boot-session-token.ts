import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * @file A single-use, in-memory, per-launch token that can be exchanged once for a real admin
 * session over loopback.
 *
 * Purpose:
 * Lets a parent process that STARTED this server prove it started it, without anybody having to
 * know a password. The token is minted at boot only when the launcher explicitly asks for one
 * (`tovu serve --emit-boot-token`), lives in this process's memory for the life of that launch, is
 * handed to the launcher over the child's own stdout pipe, and is destroyed the moment it is
 * redeemed.
 *
 * How it relates to the project:
 * `cli/commands/serve.ts` mints and emits it; `admin-http/dev-auth.ts`'s
 * `POST /api/admin/v1/auth/boot-session` redeems it. Nothing else touches it.
 *
 * **This module knows nothing about who launches the server, and must stay that way.** There is no
 * "am I in Electron" branch here and no `TOVU_DESKTOP_*` name anywhere in this file or its callers'
 * server-side halves. The contract is only: *hand me a valid single-use loopback token and I will
 * start a session.* Whoever does that is not this server's business, which is what keeps the
 * desktop shell deletable without leaving a server that misses it.
 *
 * Security properties, each one load-bearing:
 *
 * - **Nothing is persisted.** No file, no keystore, no config, no environment variable. A launch
 *   that ends takes its token with it. The token also never travels through the child's
 *   environment: an env block is readable from the process list by anything running as this user,
 *   whereas the stdout pipe is private to the parent that opened it.
 * - **Fail closed when unarmed.** `redeem` on a store that was never minted into returns `false`
 *   for every input, including `""` and `undefined`. There is deliberately no branch anywhere in
 *   which "no token was minted" means "let this through" — a permissive arm here would turn every
 *   `tovu serve` into an open admin.
 * - **Single use.** The first successful redeem clears the store, so a replay of the same token
 *   fails exactly like a wrong one. A FAILED redeem does not clear it: burning the token on a bad
 *   guess would let any local process disarm the real launcher's one redemption at will, and the
 *   token is 256-bit random, so guessing is not the threat that matters.
 * - **Constant-time comparison.** Both sides are reduced to a fixed-length SHA-256 digest before
 *   `timingSafeEqual`, which requires equal lengths and would otherwise throw on a short input.
 *
 * Architectural role:
 * A factory plus one process-scoped instance. The factory is what the tests drive, so no test has
 * to reach into module state or reset a singleton between cases; the instance exists because the
 * minting site (the CLI) and the redeeming site (a route) are in the same process but have no
 * dependency path between them.
 */

/** Bytes of entropy per token. 32 bytes = 256 bits, the same size the identity library uses for a
 *  session's own raw token. */
const TOKEN_BYTES = 32;

export interface BootSessionTokenStore {
  /** Mint and arm a new token, replacing any previous one. Returns the raw token to hand out. */
  mint: () => string;
  /** Exchange a raw token. `true` at most once per {@link mint}; `false` for everything else. */
  redeem: (rawToken: unknown) => boolean;
  /** Whether a token is currently armed. Diagnostics only — never an authorization decision. */
  isArmed: () => boolean;
}

/** SHA-256 digest of a raw token. Fixed length, which is what makes `timingSafeEqual` usable. */
function digest(rawToken: string): Buffer {
  return createHash("sha256").update(rawToken, "utf8").digest();
}

/**
 * Build an isolated single-use token store.
 *
 * @returns a {@link BootSessionTokenStore} holding at most one armed token.
 * @complexity O(1) per operation; O(1) space (one 32-byte digest).
 */
export function createBootSessionTokenStore(): BootSessionTokenStore {
  let armed: Buffer | null = null;

  return {
    mint(): string {
      const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
      armed = digest(rawToken);
      return rawToken;
    },

    redeem(rawToken: unknown): boolean {
      if (armed === null) return false;
      if (typeof rawToken !== "string" || rawToken.length === 0) return false;

      // Compared against a local copy so a concurrent `mint` cannot change what this call is
      // checking halfway through, and so the clear below cannot race a second redeem into
      // succeeding against an already-spent token.
      const expected = armed;
      if (!timingSafeEqual(digest(rawToken), expected)) return false;

      armed = null;
      return true;
    },

    isArmed(): boolean {
      return armed !== null;
    },
  };
}

/** The one store this process uses. See this file's header for why a module-scoped instance rather
 *  than something threaded through the composition root: the minting site is the CLI and the
 *  redeeming site is a route, in the same process with no dependency path between them. */
const processStore = createBootSessionTokenStore();

/** Mint this launch's boot token. Called at most once, by `cli/commands/serve.ts`. */
export function mintBootSessionToken(): string {
  return processStore.mint();
}

/** Redeem a raw boot token. `false` unless one was minted this launch and this is it, first time. */
export function redeemBootSessionToken(rawToken: unknown): boolean {
  return processStore.redeem(rawToken);
}

/** Whether this launch minted a boot token. Diagnostics only. */
export function isBootSessionTokenArmed(): boolean {
  return processStore.isArmed();
}
