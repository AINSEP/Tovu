/**
 * @file Zero-setup publishing auth — this host's own settings for the `@jini-ai/cms/publish/trust`
 * feature: the env var names it reads and the committed-config root. The feature modules never name
 * an env var or a host path; these are the values this host passes in.
 */

/** The env var a destination reads at boot. Non-secret by construction — see
 *  `@jini-ai/cms/publish/trust/provisioning`'s header. Frozen: operators revoke publishing by setting
 *  it to an empty value, which must keep overriding the committed file (fail closed). */
export const PUBLISH_TRUST_ENV_VAR = "TOVU_PUBLISH_TRUST";

/**
 * The absolute base every repo-relative committed-config path (`PUBLISH_TRUST_CONFIG_PATH`,
 * the declared deploy-config candidate paths) resolves against.
 *
 * `process.cwd()` IS the repo root for the two cases this feature was originally built against: a
 * plain `tovu serve` run from the repo root, and the deployed container, whose `Dockerfile` sets
 * `WORKDIR` to the repo root before `COPY . .`. It is NOT the repo root for the desktop shell,
 * which launches its own site server from wherever opened Electron (`apps/desktop/src/tovu-
 * server.ts`'s `buildServeEnv` doc) — the same class of gap that variable's sibling
 * `TOVU_SITE_DIR` closes for the site directory. `TOVU_REPO_ROOT` closes it here: the desktop shell
 * sets it to the repo root it already resolved for itself, unless an operator pinned one first
 * (same "operator wins" rule `buildServeEnv` applies to every variable it sets conditionally).
 *
 * Deliberately NOT `import.meta.dirname`-relative arithmetic, unlike this repo's other REPO_ROOT
 * constants (`app.ts`, `deps.ts`, `secret-scan-guard.ts`): those tolerate being wrong in a compiled
 * build because what they feed is either overridden by its own explicit env var in production
 * (`TOVU_ADMIN_DIST`/`TOVU_SITE_CHAT_DIST`, see `Dockerfile`) or fails open into a harmless dev-only
 * fallback (dev TLS). A wrong root here is not harmless: it is silently the wrong committed-config
 * file, in production, on every boot's grant read — the exact bug class this function fixes, one
 * layer up. `Dockerfile`'s own comment on `TOVU_ADMIN_DIST` documents the fixed-`..`-count trap this
 * sidesteps: the compiled layout is one level shallower (`dist/src/...`) than the source tree
 * (`apps/website/src/...`), so a distance hardcoded for one is wrong for the other.
 *
 * @param env Defaults to `process.env`; callers that already thread `env` through for
 * `PUBLISH_TRUST_ENV_VAR` (`publish-trust-grants.ts`) pass the same object rather than triggering a
 * second hidden global read.
 * @complexity O(1).
 */
export function resolveCommittedConfigRoot(env: NodeJS.ProcessEnv = process.env, _optional = {}): string {
  return env.TOVU_REPO_ROOT || process.cwd();
}

