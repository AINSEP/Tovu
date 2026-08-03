/**
 * @file Execution-mode resolution for the PUBLIC site assistant (ADR-054).
 *
 * This is the security boundary of the whole feature, which is why it is a pure function in its own
 * file with its own tests rather than an `if` inside the route: the route's job is plumbing, this
 * decides whether anonymous internet traffic may cause an OS process to spawn.
 *
 * Two modes:
 *
 * - **`byok`** (default) — Tovu calls a provider adapter in-process with a server-side key. No
 *   process spawn, no filesystem, and no tool surface beyond the read-only allowlist the caller
 *   passes in.
 * - **`cli`** (demo only) — the agent-runtime CLI path, so every registered agent (`claude`,
 *   `codex`, …) can be exercised from the public site. Each run **spawns a real OS process** with
 *   filesystem access, so N visitors is N processes. This is a demo affordance, never a production
 *   posture.
 *
 * ## Why the gate is not "loopback only"
 *
 * The obvious gate — allow `cli` only when the server is bound to loopback — is **not available**,
 * and saying otherwise would be a false guarantee. `src/index.ts`'s `app.listen(port, callback)`
 * passes **no host argument**, so Express binds every interface; there is no `TOVU_HOST` and no
 * loopback-vs-public state to read. Measured, not assumed.
 *
 * So the gate is what can actually be enforced here: `cli` requires a **second, separate** opt-in
 * env var, and is refused outright under `NODE_ENV=production`. Two independent variables means a
 * single stray `TOVU_SITE_ASSISTANT_MODE=cli` copied between environments is inert on its own —
 * the common real-world accident.
 *
 * Fails **closed** in every ambiguous case: an unrecognized mode string, a missing opt-in, or a
 * production environment all resolve to `byok`, and the reason is returned rather than swallowed so
 * the caller can log why a mode the operator asked for was not honored. Silent downgrades are how
 * an operator concludes the gate is broken and disables it.
 */

export type SiteAssistantMode = "byok" | "cli";

export interface SiteAssistantModeResolution {
  readonly mode: SiteAssistantMode;
  /**
   * Present only when the operator asked for a mode that was NOT granted. Written for a server log
   * read by a human at 2am, so it names the variable to set rather than describing the policy.
   */
  readonly refusedReason?: string;
}

/** The subset of `process.env` this decision reads. Passed in rather than read off the global so
 *  the tests exercise the real function instead of a mutated global. */
export interface SiteAssistantModeEnv {
  readonly TOVU_SITE_ASSISTANT_MODE?: string | undefined;
  readonly TOVU_SITE_ASSISTANT_ALLOW_CLI?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

export function resolveSiteAssistantMode(env: SiteAssistantModeEnv): SiteAssistantModeResolution {
  const requested = env.TOVU_SITE_ASSISTANT_MODE?.trim().toLowerCase();

  // Unset is the overwhelmingly common case and is not a refusal — nobody asked for anything.
  if (requested === undefined || requested === "" || requested === "byok") return { mode: "byok" };

  if (requested !== "cli") {
    return {
      mode: "byok",
      refusedReason: `TOVU_SITE_ASSISTANT_MODE="${requested}" is not a recognized mode (expected "byok" or "cli"); using byok`,
    };
  }

  // A typo'd or absent opt-in must not be read as consent. Only the exact string "1" counts —
  // deliberately not truthiness, because "0" and "false" are both truthy strings and an operator
  // writing TOVU_SITE_ASSISTANT_ALLOW_CLI=false plainly means no.
  if (env.TOVU_SITE_ASSISTANT_ALLOW_CLI !== "1") {
    return {
      mode: "byok",
      refusedReason:
        'cli mode requires TOVU_SITE_ASSISTANT_ALLOW_CLI="1" as a separate, explicit opt-in — it spawns an OS process per anonymous visitor; using byok',
    };
  }

  if (env.NODE_ENV === "production") {
    return {
      mode: "byok",
      refusedReason:
        "cli mode is refused under NODE_ENV=production regardless of opt-in — it spawns an OS process per anonymous visitor; using byok",
    };
  }

  return { mode: "cli" };
}
