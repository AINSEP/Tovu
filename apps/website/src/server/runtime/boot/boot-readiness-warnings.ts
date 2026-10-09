import { existsSync } from "node:fs";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveAgentPermissionMode, type AgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { COMMENTS_IP_SALT_ENV_VAR } from "#src/features/comments/index";

/**
 * @file Boot-readiness WARNINGS (2026-10-08 hardwiring audit #4 and #5): conditions worth saying
 * out loud at boot that must NOT refuse it, because existing installs have to keep booting.
 * `runProductionReadinessGateOrExit()` calls {@link warnOnBootReadinessGaps} first, so both real
 * boot paths (`index.ts`, `tovu serve`) print these with no second call site to forget.
 *
 * 1. Deployed but not in production mode (#5). `TOVU_RUNTIME_MODE=production` is the only switch
 *    that arms the production gate and restricts the agent CLI — `fly.toml` and
 *    `docker-compose.yml` set it, but a bare `docker run` of the image (or any copied compose file
 *    without it) boots in local mode: no unsafe-default checks and an agent in "bypass" mode. The
 *    mode itself deliberately never reads `NODE_ENV` (`runtime-mode.ts`, INV-02), so this only
 *    WARNS from deployment signals rather than flipping the mode. Signals, each a fact rather than
 *    a guess: `NODE_ENV=production` (the image's own `ENV`; local dev and desktop-spawned sites
 *    never set it — `local-site-process.ts` sets `development`), a container marker file
 *    (`/.dockerenv`, Podman's `/run/.containerenv`), or a platform env (`KUBERNETES_SERVICE_HOST`,
 *    `FLY_APP_NAME`). Non-loopback bind was considered and rejected: `index.ts` binds every
 *    interface by default in dev too, so it would warn on every `npm run dev`.
 * 2. `COMMENTS_IP_SALT` unset in production (#4). Safe — the salt is then derived from the site
 *    key (`features/comments/ip-hash-salt.ts`) — but rotating the site key changes every
 *    commenter's IP hash, so an operator should pin it.
 *
 * Never throws, never exits, never prints a secret value — only variable names and signal labels.
 */

/** Container marker files: Docker writes `/.dockerenv`; Podman writes `/run/.containerenv`. */
const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"] as const;

/**
 * The facts that say this server is running as a deployed/self-hosted server.
 * @returns human-readable labels (no values beyond `NODE_ENV=production`); empty when none apply.
 * @complexity O(1): two env reads per signal and at most two `pathExists` probes.
 */
export function detectDeploymentSignals(
  required: { env: Readonly<Record<string, string | undefined>> },
  optional: { pathExists?: (path: string) => boolean } = {}
): string[] {
  const pathExists = optional.pathExists ?? existsSync;
  const signals: string[] = [];
  if (required.env.NODE_ENV === "production") signals.push("NODE_ENV=production");
  for (const marker of CONTAINER_MARKER_FILES) if (pathExists(marker)) signals.push(`container (${marker})`);
  if (required.env.KUBERNETES_SERVICE_HOST) signals.push("Kubernetes (KUBERNETES_SERVICE_HOST)");
  if (required.env.FLY_APP_NAME) signals.push("Fly.io (FLY_APP_NAME)");
  return signals;
}

/**
 * The warning lines for one boot, as data so the wording is assertable without a console.
 * @complexity O(signals).
 */
export function collectBootReadinessWarnings(
  required: {
    env: Readonly<Record<string, string | undefined>>;
    mode: RuntimeMode;
    deploymentSignals: readonly string[];
    agentPermissionMode: AgentPermissionMode;
  },
  _optional: Record<string, never> = {}
): string[] {
  const warnings: string[] = [];
  if (required.mode !== "production" && required.deploymentSignals.length > 0) {
    const agent = required.agentPermissionMode === "bypass" ? ' and the assistant agent runs with permission mode "bypass"' : "";
    warnings.push(
      `[boot-readiness] WARNING: this server looks deployed (${required.deploymentSignals.join(", ")}) but TOVU_RUNTIME_MODE is not "production": ` +
        `production boot checks are off${agent}. Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).`
    );
  }
  const salt = required.env[COMMENTS_IP_SALT_ENV_VAR];
  if (required.mode === "production" && (salt === undefined || salt.trim() === "")) {
    warnings.push(
      `[boot-readiness] WARNING: ${COMMENTS_IP_SALT_ENV_VAR} is not set: comment IP hashes are salted with a value derived from the site key, ` +
        `so rotating the site key changes them. Set ${COMMENTS_IP_SALT_ENV_VAR} to a long random value to pin it.`
    );
  }
  return warnings;
}

/**
 * Prints this boot's readiness warnings. Wires the real env, mode, file probe and agent mode.
 * @throws never: a failing probe or log sink is swallowed — a warning must not take boot down.
 * @complexity O(1).
 */
export function warnOnBootReadinessGaps(
  optional: { env?: Record<string, string | undefined>; pathExists?: (path: string) => boolean; log?: (line: string) => void } = {}
): void {
  try {
    const env = optional.env ?? process.env;
    const log = optional.log ?? ((line: string) => console.warn(line));
    const warnings = collectBootReadinessWarnings({
      env,
      mode: resolveRuntimeMode({ env }),
      deploymentSignals: detectDeploymentSignals({ env }, { pathExists: optional.pathExists }),
      agentPermissionMode: resolveAgentPermissionMode({ env }),
    });
    for (const line of warnings) log(line);
  } catch {
    /* nothing here is worth failing a boot over */
  }
}
