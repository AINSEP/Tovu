import { existsSync } from "node:fs";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveAgentPermissionMode, type AgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { COMMENTS_IP_SALT_ENV_VAR } from "#src/features/comments/index";
import { LEGACY_DEPLOYMENT_ADVICE, type HostSignalOptions } from "#src/contracts/core/host-signals";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";

/**
 * @file Boot-readiness WARNINGS (2026-10-08 hardwiring audit #4 and #5): conditions worth saying
 * out loud at boot that must NOT refuse it, because existing installs have to keep booting.
 * `runProductionReadinessGateOrExit()` calls {@link warnOnBootReadinessGaps} first, so both real
 * boot paths (`index.ts`, `tovu serve`) print these with no second call site to forget.
 *
 * 1. Deployed but not in production mode (#5). `TOVU_RUNTIME_MODE=production` is the only switch
 *    that arms the production gate and restricts the agent CLI — shipped deployment configs
 *    set it, but a bare `docker run` of the image (or any copied compose file
 *    without it) boots in local mode: no unsafe-default checks and an agent in "bypass" mode. The
 *    mode itself deliberately never reads `NODE_ENV` (`runtime-mode.ts`, INV-02), so this only
 *    WARNS from deployment signals rather than flipping the mode. Signals, each a fact rather than
 *    a guess: `NODE_ENV=production` (the image's own `ENV`; local dev and desktop-spawned sites
 *    never set it — `local-site-process.ts` sets `development`), a container marker file
 *    (`/.dockerenv`, Podman's `/run/.containerenv`), Kubernetes or shipped platform env hints.
 *    Non-loopback bind was considered and rejected: `index.ts` binds every
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
 * @complexity O(labels) with injected facts and two file probes; otherwise a bundled manifest scan.
 */
export function detectDeploymentSignals(
  required: { env: Readonly<Record<string, string | undefined>> },
  optional: HostSignalOptions & { pathExists?: (path: string) => boolean } = {}
): string[] {
  const pathExists = optional.pathExists ?? existsSync;
  const signals: string[] = [];
  if (required.env.NODE_ENV === "production") signals.push("NODE_ENV=production");
  for (const marker of CONTAINER_MARKER_FILES) if (pathExists(marker)) signals.push(`container (${marker})`);
  if (required.env.KUBERNETES_SERVICE_HOST) signals.push("Kubernetes (KUBERNETES_SERVICE_HOST)");
  signals.push(...(optional.hostSignals ?? resolveHostSignals(required)).labels);
  return signals;
}

/**
 * The warning lines for one boot, as data so the wording is assertable without a console.
 * @complexity O(signals), plus a bundled manifest scan when deployed advice is not injected.
 */
export function collectBootReadinessWarnings(
  required: {
    env: Readonly<Record<string, string | undefined>>;
    mode: RuntimeMode;
    deploymentSignals: readonly string[];
    agentPermissionMode: AgentPermissionMode;
  },
  optional: HostSignalOptions = {}
): string[] {
  const warnings: string[] = [];
  if (required.mode !== "production" && required.deploymentSignals.length > 0) {
    warnings.push(deploymentModeWarning(required, optional));
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

/** Preserve the warning bytes; optional shipped advice never decides whether boot is allowed.
 * @complexity O(signals) to format labels; a default call also reads the bundled manifest hints. */
function deploymentModeWarning(
  required: { env: Readonly<Record<string, string | undefined>>; deploymentSignals: readonly string[]; agentPermissionMode: AgentPermissionMode },
  optional: HostSignalOptions = {},
): string {
  const agent = required.agentPermissionMode === "bypass" ? ' and the assistant agent runs with permission mode "bypass"' : "";
  const advice = (optional.hostSignals ?? resolveHostSignals(required)).deploymentAdvice ?? LEGACY_DEPLOYMENT_ADVICE;
  return `[boot-readiness] WARNING: this server looks deployed (${required.deploymentSignals.join(", ")}) but TOVU_RUNTIME_MODE is not "production": ` +
    `production boot checks are off${agent}. ${advice}`;
}

/**
 * Prints this boot's readiness warnings. Wires the real env, mode, file probe and agent mode.
 * @throws never: a failing probe or log sink is swallowed — a warning must not take boot down.
 * @complexity O(p + s) for p shipped manifests and s warning labels.
 */
export function warnOnBootReadinessGaps(
  optional: HostSignalOptions & { env?: Record<string, string | undefined>; pathExists?: (path: string) => boolean; log?: (line: string) => void } = {}
): void {
  try {
    const env = optional.env ?? process.env;
    const hostSignals = optional.hostSignals ?? resolveHostSignals({ env });
    const log = optional.log ?? ((line: string) => console.warn(line));
    const warnings = collectBootReadinessWarnings({
      env,
      mode: resolveRuntimeMode({ env }),
      deploymentSignals: detectDeploymentSignals({ env }, { hostSignals, pathExists: optional.pathExists }),
      agentPermissionMode: resolveAgentPermissionMode({ env }, { hostSignals }),
    }, { hostSignals });
    for (const line of warnings) log(line);
  } catch {
    /* nothing here is worth failing a boot over */
  }
}
