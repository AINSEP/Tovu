/**
 * @file SPEC-022 C-001 — runtime-mode signal resolution (REQ-02, INV-02, INV-04, EC-02).
 *
 * `TOVU_RUNTIME_MODE` is the ONLY source ever consulted. `NODE_ENV` is never read here, in
 * either direction (INV-02) — see behavior.spec.md §1.1. Any missing/unrecognized value
 * resolves to `local`, never `production` (INV-04/EC-02): the only default that is safe in
 * both directions, since it activates no containment the operator didn't explicitly opt into.
 *
 * Lives in `core/` rather than `server/` (where it used to be): a dependency-free policy signal
 * (reads one env var, no Express/transport coupling) consulted by `mail/purpose-scoped-mailer.ts`
 * and `assistant/agent-daemon-server.ts`, both outside the composition root — the same
 * "domain importing its host's transport module" misplacement `core/rate-limit/rate-limit.ts` was
 * relocated for (2026-08-02 module-graph analysis, Phase 3).
 */

export type RuntimeMode = "production" | "local";

export interface ResolveRuntimeModeOptions {
  /** Defaults to the real `process.env` when this whole options object is omitted. */
  env?: Record<string, string | undefined>;
}

export function resolveRuntimeMode(options?: ResolveRuntimeModeOptions): RuntimeMode {
  const env = options === undefined ? process.env : options.env ?? {};
  return env.TOVU_RUNTIME_MODE === "production" ? "production" : "local";
}
