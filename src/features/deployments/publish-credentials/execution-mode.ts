/**
 * @file The install's publish execution mode — `"self-hosted-cli"` (a human has a real terminal on
 * this machine, and the assistant/CLI publish route from the Static Site tab's own header applies) or
 * `"hosted-api-only"` (no terminal exists for this install; only saved provider connections in
 * `publish_credential_sets` can ever publish).
 *
 * Purpose:
 * Explicit and server-provided ONLY — this dispatch's brief is emphatic that this must NEVER be
 * derived from `NODE_ENV` or by sniffing `PATH` for a CLI binary. Both would silently misclassify a
 * real install: `NODE_ENV=production` is set on plenty of self-hosted machines with a real terminal
 * and a signed-in `gh`, and PATH-sniffing only proves a binary exists, not that this process is
 * actually running somewhere a human can reach a terminal for it (a container with `gh` baked into
 * its image but no interactive shell would falsely read as self-hosted-capable).
 *
 * How it relates to the project:
 * A plain env var (`TOVU_EXECUTION_MODE`) is the same category of operator-supplied config this
 * codebase already reads directly from `process.env` for things that aren't (yet) in the encrypted
 * settings store — see `static-publish/credentials.ts`'s own header for the precedent this follows
 * (`TOVU_EXPORT_DIR`/`TOVU_ADMIN_PASSWORD` are the same shape). Defaults to `"self-hosted-cli"`
 * (today's only real mode — Docker/hosted installs are the new case this dispatch adds a path for),
 * so an operator who has not set the var at all keeps today's behavior unchanged.
 */
export type PublishExecutionMode = "self-hosted-cli" | "hosted-api-only";

const ENV_VAR = "TOVU_EXECUTION_MODE";
const DEFAULT_MODE: PublishExecutionMode = "self-hosted-cli";

/**
 * Reads the execution mode from `env[TOVU_EXECUTION_MODE]`. Any value other than the literal string
 * `"hosted-api-only"` (including unset, blank, or a typo) resolves to the safe default
 * `"self-hosted-cli"` — an unrecognized value must never silently disable the self-hosted CLI path an
 * operator is actually relying on.
 *
 * @param env - Defaults to `process.env`; overridable for tests so no test needs to mutate real
 *   process env vars (which would leak across parallel test files in the same process — same
 *   reasoning `createEnvPublishCredentialSource`'s own `env` parameter documents).
 * @complexity O(1).
 * @overallScore 100
 */
export function executionModeFromEnv(env: NodeJS.ProcessEnv = process.env): PublishExecutionMode {
  return env[ENV_VAR] === "hosted-api-only" ? "hosted-api-only" : DEFAULT_MODE;
}
