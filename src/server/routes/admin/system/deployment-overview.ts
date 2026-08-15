import type { Express } from "express";

import { resolveRuntimeMode } from "#src/core/runtime-mode";
import { DEFAULT_OWNER_PASSWORD } from "#src/identity/wiring";
import { defaultContentDbPath, mediaUploadsDir } from "#src/server/deps";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { isAssistantDaemonKnownFailed } from "#src/server/readiness-state";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Deployment panel → Overview tab backend.
 *
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/system/deployment-overview` — a read-only
 * snapshot of how THIS instance is currently running, for the self-hosted-developer audience the
 * Deployment panel now targets. Every field here is a direct read of a value this process already
 * computed at boot or can compute for free; nothing is measured, inferred, or fabricated.
 *
 * Mirrors `module-status.ts`'s shape exactly (workspace-id 404 check → `system.read` authorize →
 * 403-on-denial), reusing the same permission — this is one more system-status read, not a new kind
 * of capability. `entityType: "deployment-status"` follows `recent-hits.ts`'s precedent of a
 * route-specific descriptive string rather than a shared literal across unrelated resources.
 */
export type AdminDeploymentOverviewDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

/** One required-for-production env var's presence, never its value. */
export interface DeploymentEnvVarStatus {
  name: string;
  set: boolean;
}

export interface DeploymentOverviewSnapshot {
  /** `resolveRuntimeMode()`'s own two-value type — deliberately not "development": Tovu's actual
   *  runtime-mode signal is `"production" | "local"` (`core/runtime-mode.ts`), and echoing that
   *  exact vocabulary here is more honest than translating it to a pair the UI never really has. */
  mode: "production" | "local";
  /**
   * The boot-time production readiness gate (`production-readiness-gate.ts`) is "entirely inert
   * outside production mode" by its own doc comment, and in production mode a failing gate exits
   * the process before it ever starts listening (`index.ts`'s `runBootGateOrExit`) — so a request
   * reaching this route in production mode is itself proof the gate passed. `applicable: false`
   * in local mode is the honest "this check does not run here" state, not a hidden pass.
   */
  productionReadinessGate: { applicable: boolean; passed: boolean };
  /**
   * Whether the seeded owner account is still on the publicly-documented default password — the
   * exact literal comparison `index.ts`'s own boot gate uses, computed here unconditionally
   * (not gated on production mode) since it is a real, useful warning in local mode too.
   */
  defaultOwnerPasswordUnsafe: boolean;
  /**
   * Whether the locally-spawned agent daemon is KNOWN to have failed (`readiness-state.ts`). This
   * is a negative signal only — "not known-failed" can also mean "never spawned" (e.g. pure BYOK
   * setups never start it), so the UI must not read `!daemonKnownFailed` as "confirmed alive".
   */
  daemonKnownFailed: boolean;
  /** `defaultContentDbPath()` — the same path `deps.ts` opens SQLite from. */
  dbPath: string;
  /** `mediaUploadsDir()` — the same path the blob store writes under. */
  uploadsDir: string;
  /** Presence only, per required env var — never a value. */
  envVars: DeploymentEnvVarStatus[];
}

/** The four env vars the brief calls out — order here is display order. */
const REQUIRED_ENV_VAR_NAMES = [
  "TOVU_ADMIN_PASSWORD",
  "TOVU_ADMIN_USER",
  "TOVU_INTEGRATIONS_ROOT_KEY",
  "JINI_AGENT_DAEMON_PORT",
] as const;

/**
 * Builds the snapshot from live process state. Exported separately from the route registrar so a
 * test can call it directly without spinning up Express.
 *
 * @complexity O(1) — fixed-size env var list, no iteration over caller-controlled data.
 */
export function buildDeploymentOverviewSnapshot(): DeploymentOverviewSnapshot {
  const mode = resolveRuntimeMode();
  return {
    mode,
    productionReadinessGate: { applicable: mode === "production", passed: mode === "production" },
    defaultOwnerPasswordUnsafe: (process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
    daemonKnownFailed: isAssistantDaemonKnownFailed(),
    dbPath: defaultContentDbPath(),
    uploadsDir: mediaUploadsDir(),
    envVars: REQUIRED_ENV_VAR_NAMES.map((name) => ({ name, set: Boolean(process.env[name]) })),
  };
}

export function registerAdminDeploymentOverviewRoute(app: Express, deps: AdminDeploymentOverviewDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/system/deployment-overview", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "system.read",
      workspaceId: deps.workspaceId,
      entityType: "deployment-status",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'system.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "system.read", reason: authResult.reason },
      });
      return;
    }

    res.status(200).json(buildDeploymentOverviewSnapshot());
  });
}
